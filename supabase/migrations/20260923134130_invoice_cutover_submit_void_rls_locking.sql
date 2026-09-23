/*
# Coordinated Sent→Submitted Cutover, Finalization, RLS, and Locking

## Summary
This is the breaking-change migration for the coordinated sent→submitted cutover.
It must be deployed together with frontend status label updates and edge function updates.

## Changes

### 1. Status Constraint Cutover
- Replaces the invoices_status_check constraint: removes 'sent', adds 'submitted'
- New allowed statuses: draft, submitted, partial, paid, overdue, void

### 2. Database Function Status Updates (sent → submitted)
- guard_finalization_tax_check(), write_tax_snapshot_on_invoice_finalized trigger,
  create_deposit_invoice_from_proposal() (both overloads), generate_recurring_invoices(),
  handle_deposit_billing_action(), handle_proposal_approval(), handle_unified_proposal_approval(),
  send_deposit_request_notification(), update_invoice_payment_status()

### 3. New submit_invoice() RPC Function
### 4. New void_invoice() RPC Function
### 5. Portal RLS Policy Replacement
### 6. Internal Staff Visibility RLS Update
### 7. Post-Submit Locking Triggers
### 8. Delete Policy: only drafts can be deleted
*/

-- ============================================================
-- 1. Status Constraint Cutover
-- ============================================================

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_status_check
  CHECK (status = ANY (ARRAY['draft'::text, 'submitted'::text, 'paid'::text, 'partial'::text, 'overdue'::text, 'void'::text]));

-- ============================================================
-- 2. Database Function Status Updates
-- ============================================================

-- 2a. guard_finalization_tax_check: update invoice branch
CREATE OR REPLACE FUNCTION guard_finalization_tax_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tax_status text;
  v_is_finalizing boolean := false;
  v_calc_result jsonb;
  v_resolved_status text;
  v_transaction_type text;
  v_transaction_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'proposals' THEN
    IF NEW.status IN ('sent', 'approved') AND COALESCE(OLD.status, '') NOT IN ('sent', 'approved') THEN
      v_is_finalizing := true;
    END IF;
    v_transaction_type := 'proposal';
    v_transaction_id := NEW.id;
  ELSIF TG_TABLE_NAME = 'change_orders' THEN
    IF NEW.status = 'approved' AND COALESCE(OLD.status, '') <> 'approved' THEN
      v_is_finalizing := true;
    END IF;
    v_transaction_type := 'change_order';
    v_transaction_id := NEW.id;
  ELSIF TG_TABLE_NAME = 'invoices' THEN
    IF NEW.status = 'submitted' AND COALESCE(OLD.status, '') <> 'submitted' THEN
      v_is_finalizing := true;
    END IF;
    v_transaction_type := 'invoice';
    v_transaction_id := NEW.id;
  END IF;

  IF NOT v_is_finalizing THEN
    RETURN NEW;
  END IF;

  v_tax_status := NEW.tax_calculation_status;

  IF v_tax_status IN ('ready', 'exempt', 'not_collecting') THEN
    RETURN NEW;
  END IF;

  IF v_tax_status = 'review_required' THEN
    BEGIN
      v_calc_result := calculate_tax_context(v_transaction_type, v_transaction_id);
      v_resolved_status := v_calc_result->>'tax_calculation_status';
      IF COALESCE((v_calc_result->>'taxable_subtotal')::numeric, 0) = 0 THEN
        NEW.tax_calculation_status := v_resolved_status;
        NEW.tax_review_required := false;
        NEW.tax_amount := 0;
        RETURN NEW;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Cannot finalize %: tax calculation requires review. Please resolve tax review issues before finalizing.', TG_TABLE_NAME
      USING ERRCODE = 'check_violation';
    END;
    RAISE EXCEPTION 'Cannot finalize %: tax calculation requires review. Please resolve tax review issues before finalizing.', TG_TABLE_NAME
    USING ERRCODE = 'check_violation';
  END IF;

  IF v_tax_status IS NULL OR v_tax_status NOT IN ('ready', 'exempt', 'not_collecting', 'review_required') THEN
    BEGIN
      v_calc_result := calculate_tax_context(v_transaction_type, v_transaction_id);
      v_resolved_status := v_calc_result->>'tax_calculation_status';
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Cannot finalize %: tax calculation could not be resolved. Please run tax calculation and resolve any issues before finalizing.', TG_TABLE_NAME
      USING ERRCODE = 'check_violation';
    END;

    IF v_resolved_status IN ('ready', 'exempt', 'not_collecting') THEN
      NEW.tax_calculation_status := v_resolved_status;
      NEW.tax_review_required := false;
      NEW.tax_amount := COALESCE((v_calc_result->>'tax_amount')::numeric, 0);
      RETURN NEW;
    ELSIF v_resolved_status = 'review_required' THEN
      IF COALESCE((v_calc_result->>'taxable_subtotal')::numeric, 0) = 0 THEN
        NEW.tax_calculation_status := v_resolved_status;
        NEW.tax_review_required := false;
        NEW.tax_amount := 0;
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'Cannot finalize %: tax calculation requires review. Please resolve tax review issues before finalizing.', TG_TABLE_NAME
      USING ERRCODE = 'check_violation';
    ELSE
      RAISE EXCEPTION 'Cannot finalize %: tax calculation returned an unrecognized status. Please run tax calculation and resolve any issues before finalizing.', TG_TABLE_NAME
      USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RAISE EXCEPTION 'Cannot finalize %: tax calculation status must be resolved before finalizing.', TG_TABLE_NAME
  USING ERRCODE = 'check_violation';
END;
$$;

-- 2b. write_tax_snapshot_on_invoice_finalized trigger
CREATE OR REPLACE FUNCTION write_tax_snapshot_on_invoice_finalized()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM write_tax_snapshot('invoice', NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_tax_snapshot_invoice_finalized ON invoices;
CREATE TRIGGER trigger_tax_snapshot_invoice_finalized
  AFTER UPDATE ON invoices
  FOR EACH ROW
  WHEN (NEW.status = 'submitted' AND COALESCE(OLD.status, '') <> 'submitted')
  EXECUTE FUNCTION write_tax_snapshot_on_invoice_finalized();

-- 2c. create_deposit_invoice_from_proposal - drop both overloads first, then recreate
DROP FUNCTION IF EXISTS create_deposit_invoice_from_proposal(uuid) CASCADE;
DROP FUNCTION IF EXISTS create_deposit_invoice_from_proposal(uuid, text) CASCADE;

CREATE OR REPLACE FUNCTION create_deposit_invoice_from_proposal(p_proposal_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id uuid;
  v_invoice_number text;
  v_proposal record;
  v_deposit_amount numeric(10,2);
  v_deposit_description text;
BEGIN
  SELECT
    p.id, p.company_id, p.contact_id, p.proposal_number, p.deposit_amount_due, p.created_by,
    c.full_name as contact_name
  INTO v_proposal
  FROM proposals p
  LEFT JOIN contacts c ON c.id = p.contact_id
  WHERE p.id = p_proposal_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposal not found';
  END IF;

  v_deposit_amount := COALESCE(v_proposal.deposit_amount_due, 0);

  IF v_deposit_amount <= 0 THEN
    RAISE EXCEPTION 'No deposit amount to invoice';
  END IF;

  v_invoice_number := generate_invoice_number();
  v_deposit_description := 'Deposit for Proposal ' || v_proposal.proposal_number;

  INSERT INTO invoices (
    company_id, proposal_id, contact_id, invoice_number, invoice_type,
    invoice_date, due_date, subtotal, tax_amount, total, amount_due, status,
    payment_terms, notes, created_by, created_at, updated_at
  ) VALUES (
    v_proposal.company_id, v_proposal.id, v_proposal.contact_id, v_invoice_number, 'deposit',
    CURRENT_DATE, CURRENT_DATE, v_deposit_amount, 0, v_deposit_amount, v_deposit_amount,
    'submitted',
    'Due upon receipt',
    'Deposit invoice for ' || v_proposal.contact_name,
    v_proposal.created_by, now(), now()
  ) RETURNING id INTO v_invoice_id;

  INSERT INTO invoice_line_items (
    invoice_id, description, quantity, unit_price, amount, sort_order
  ) VALUES (
    v_invoice_id, v_deposit_description, 1, v_deposit_amount, v_deposit_amount, 1
  );

  UPDATE proposals SET deposit_invoice_id = v_invoice_id WHERE id = p_proposal_id;

  RETURN v_invoice_id;
END;
$$;

CREATE OR REPLACE FUNCTION create_deposit_invoice_from_proposal(p_proposal_id uuid, p_invoice_status text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id uuid;
  v_invoice_number text;
  v_proposal record;
  v_deposit_amount numeric(10,2);
  v_deposit_description text;
  v_payment_id uuid;
BEGIN
  SELECT
    p.id, p.company_id, p.contact_id, p.proposal_number, p.deposit_amount_due, p.created_by,
    p.deposit_payment_date, p.tax_rate, c.full_name as contact_name
  INTO v_proposal
  FROM proposals p
  LEFT JOIN contacts c ON c.id = p.contact_id
  WHERE p.id = p_proposal_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposal not found';
  END IF;

  v_deposit_amount := COALESCE(v_proposal.deposit_amount_due, 0);

  IF v_deposit_amount <= 0 THEN
    RAISE EXCEPTION 'No deposit amount to invoice';
  END IF;

  v_invoice_number := generate_invoice_number();
  v_deposit_description := 'Deposit for Proposal ' || v_proposal.proposal_number;

  INSERT INTO invoices (
    company_id, proposal_id, contact_id, invoice_number, invoice_type,
    invoice_date, due_date, subtotal, tax_amount, tax_rate, total, amount_due, status,
    payment_terms, notes, created_by, created_at, updated_at
  ) VALUES (
    v_proposal.company_id, v_proposal.id, v_proposal.contact_id, v_invoice_number, 'deposit',
    CURRENT_DATE, CURRENT_DATE, v_deposit_amount, 0, COALESCE(v_proposal.tax_rate, 0),
    v_deposit_amount,
    CASE WHEN p_invoice_status = 'paid' THEN 0 ELSE v_deposit_amount END,
    CASE WHEN p_invoice_status = 'paid' THEN 'paid' ELSE 'submitted' END,
    CASE WHEN p_invoice_status = 'paid' THEN 'Paid' ELSE 'Due upon receipt' END,
    CASE WHEN p_invoice_status = 'paid' THEN 'Deposit payment received for ' || v_proposal.contact_name
         ELSE 'Deposit invoice for ' || v_proposal.contact_name END,
    v_proposal.created_by, now(), now()
  ) RETURNING id INTO v_invoice_id;

  INSERT INTO invoice_line_items (
    invoice_id, description, quantity, unit_price, amount, sort_order, taxable
  ) VALUES (
    v_invoice_id, v_deposit_description, 1, v_deposit_amount, v_deposit_amount, 1, false
  );

  IF p_invoice_status = 'paid' THEN
    INSERT INTO invoice_payments (
      company_id, invoice_id, proposal_id, payment_date, amount, payment_method,
      reference_number, notes, created_by, created_at
    ) VALUES (
      v_proposal.company_id, v_invoice_id, v_proposal.id,
      COALESCE(v_proposal.deposit_payment_date, CURRENT_DATE), v_deposit_amount, 'other',
      'Deposit - Proposal ' || v_proposal.proposal_number,
      'Deposit payment recorded at proposal approval',
      v_proposal.created_by, now()
    ) RETURNING id INTO v_payment_id;
  END IF;

  UPDATE proposals SET deposit_invoice_id = v_invoice_id WHERE id = p_proposal_id;

  RETURN v_invoice_id;
END;
$$;

-- 2d. generate_recurring_invoices: update 'sent' to 'submitted'
CREATE OR REPLACE FUNCTION generate_recurring_invoices()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_generated integer := 0;
  v_failed integer := 0;
  v_errors text[] := ARRAY[]::text[];
  v_contact RECORD;
  v_sub RECORD;
  v_invoice_id uuid;
  v_invoice_number text;
  v_billing_amount numeric;
  v_tax_rate numeric;
  v_tax_amount numeric;
  v_total numeric;
  v_subtotal numeric;
  v_discount numeric := 0;
  v_period_start date;
  v_period_end date;
  v_next_date date;
  v_ri_id uuid;
  v_pref text;
  v_annual_enabled boolean;
  v_disc_type text;
  v_disc_pct numeric;
  v_disc_flat numeric;
  v_line_sort integer := 1;
  v_line_amount numeric;
  v_is_annual boolean;
  v_org_id uuid;
  v_office_id uuid;
  v_contact_name text;
  v_contact_email text;
  v_contact_tax_rate numeric;
  v_is_tax_exempt boolean;
  v_tax_environment text;
  v_tax_jurisdiction_id uuid;
  v_grace_days integer;
BEGIN
  SELECT
    annual_billing_enabled, annual_discount_type, annual_discount_percentage,
    annual_discount_flat_amount, grace_period_days
  INTO
    v_annual_enabled, v_disc_type, v_disc_pct, v_disc_flat, v_grace_days
  FROM company_settings LIMIT 1;

  v_disc_type := COALESCE(v_disc_type, 'none');
  v_disc_pct := COALESCE(v_disc_pct, 0);
  v_disc_flat := COALESCE(v_disc_flat, 0);
  v_grace_days := COALESCE(v_grace_days, 0);

  FOR v_contact IN
    SELECT DISTINCT rs.contact_id
    FROM recurring_subscriptions rs
    WHERE rs.status = 'active'
      AND rs.auto_invoice = true
      AND rs.next_billing_date <= CURRENT_DATE
      AND rs.contact_id IS NOT NULL
  LOOP
    BEGIN
      v_pref := get_customer_billing_preference(v_contact.contact_id);
      v_is_annual := (v_pref = 'annual' AND v_annual_enabled = true);

      FOR v_sub IN
        SELECT rs.*, c.full_name as contact_name, c.email as contact_email,
               c.tax_rate as contact_tax_rate, c.is_tax_exempt,
               c.tax_environment, c.tax_jurisdiction_id, c.organization_id, c.office_id
        FROM recurring_subscriptions rs
        JOIN contacts c ON c.id = rs.contact_id
        WHERE rs.contact_id = v_contact.contact_id
          AND rs.status = 'active'
          AND rs.auto_invoice = true
          AND rs.next_billing_date <= CURRENT_DATE
      LOOP
        BEGIN
          v_billing_amount := v_sub.billing_amount;
          v_tax_rate := COALESCE(v_sub.tax_rate, v_sub.contact_tax_rate, 0);
          v_tax_environment := COALESCE(v_sub.tax_environment, 'residential');
          v_tax_jurisdiction_id := v_sub.tax_jurisdiction_id;
          v_org_id := v_sub.organization_id;
          v_office_id := v_sub.office_id;
          v_contact_name := v_sub.contact_name;
          v_contact_email := v_sub.contact_email;
          v_is_tax_exempt := COALESCE(v_sub.is_tax_exempt, false);

          IF v_is_annual THEN
            IF v_disc_type = 'percentage' THEN
              v_discount := v_billing_amount * (v_disc_pct / 100);
            ELSIF v_disc_type = 'flat' THEN
              v_discount := v_disc_flat;
            ELSE
              v_discount := 0;
            END IF;
          ELSE
            v_discount := 0;
          END IF;

          v_subtotal := v_billing_amount - v_discount;
          v_tax_amount := CASE WHEN v_is_tax_exempt THEN 0 ELSE round(v_subtotal * v_tax_rate / 100, 2) END;
          v_total := v_subtotal + v_tax_amount;

          v_period_start := v_sub.next_billing_date;
          v_period_end := v_period_start + (v_sub.billing_interval_days || ' days')::interval - 1;
          v_next_date := v_period_end + 1;

          v_invoice_number := generate_invoice_number();

          INSERT INTO invoices (
            company_id, contact_id, invoice_number, invoice_type,
            invoice_date, due_date, subtotal, tax_amount, total,
            amount_paid, amount_due, status, tax_rate,
            tax_environment, tax_jurisdiction_id, tax_project_type,
            source_type, office_id, organization_id,
            notes, created_by, created_at, updated_at
          ) VALUES (
            v_org_id, v_sub.contact_id, v_invoice_number, 'recurring',
            CURRENT_DATE, CURRENT_DATE + 10, v_subtotal, v_tax_amount, v_total,
            0, v_total, 'submitted', v_tax_rate,
            v_tax_environment, v_tax_jurisdiction_id, 'general_installation_repair',
            'recurring', v_office_id, v_org_id,
            'Recurring Billing System', null, now(), now()
          ) RETURNING id INTO v_invoice_id;

          v_line_sort := 1;
          INSERT INTO invoice_line_items (
            invoice_id, description, quantity, unit_price, amount, sort_order, taxable, organization_id
          ) VALUES (
            v_invoice_id, v_sub.description || ' (' || v_period_start || ' to ' || v_period_end || ')',
            1, v_subtotal, v_subtotal, v_line_sort, NOT v_is_tax_exempt, v_org_id
          );

          IF v_discount > 0 THEN
            v_line_sort := v_line_sort + 1;
            INSERT INTO invoice_line_items (
              invoice_id, description, quantity, unit_price, amount, sort_order, taxable, organization_id
            ) VALUES (
              v_invoice_id, 'Annual Billing Discount', 1, -v_discount, -v_discount, v_line_sort, false, v_org_id
            );
          END IF;

          UPDATE recurring_subscriptions
          SET next_billing_date = v_next_date, updated_at = now()
          WHERE id = v_sub.id;

          v_generated := v_generated + 1;
        EXCEPTION WHEN OTHERS THEN
          v_failed := v_failed + 1;
          v_errors := array_append(v_errors, SQLERRM);
        END;
      END LOOP;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      v_errors := array_append(v_errors, SQLERRM);
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'generated', v_generated,
    'failed', v_failed,
    'errors', to_jsonb(v_errors)
  );
END;
$$;

-- 2e. send_deposit_request_notification: update 'sent' to 'submitted'
CREATE OR REPLACE FUNCTION send_deposit_request_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contact_email text;
  v_contact_name text;
  v_proposal_number text;
  v_deposit_amount numeric;
BEGIN
  IF NEW.invoice_type = 'deposit'
  AND NEW.status = 'submitted'
  AND (OLD.id IS NULL OR OLD.status IS DISTINCT FROM 'submitted')
  AND NEW.proposal_id IS NOT NULL
  THEN
    SELECT
      c.email,
      COALESCE(c.full_name, c.contact_name, c.email),
      p.proposal_number,
      p.deposit_amount_due
    INTO
      v_contact_email, v_contact_name, v_proposal_number, v_deposit_amount
    FROM contacts c
    JOIN proposals p ON p.contact_id = c.id
    WHERE c.id = NEW.contact_id
    AND p.id = NEW.proposal_id;

    IF v_contact_email IS NOT NULL THEN
      BEGIN
        INSERT INTO proposal_notifications (
          proposal_id, contact_id, notification_type, recipient_email, subject, sent_at
        ) VALUES (
          NEW.proposal_id, NEW.contact_id, 'deposit_request', v_contact_email,
          'Deposit Payment Required - Proposal ' || v_proposal_number, now()
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Failed to create deposit request notification: %', SQLERRM;
      END;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 2f. update_invoice_payment_status: 'sent' → 'submitted'
CREATE OR REPLACE FUNCTION update_invoice_payment_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id uuid;
  v_total numeric;
  v_paid numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_invoice_id := OLD.invoice_id;
  ELSE
    v_invoice_id := NEW.invoice_id;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid
  FROM payments WHERE invoice_id = v_invoice_id;

  SELECT total INTO v_total FROM invoices WHERE id = v_invoice_id;

  UPDATE invoices
  SET
    amount_paid = v_paid,
    amount_due = v_total - v_paid,
    status = CASE
      WHEN v_paid = 0 THEN 'submitted'
      WHEN v_paid >= v_total THEN 'paid'
      WHEN v_paid > 0 AND v_paid < v_total THEN 'partial'
      ELSE status
    END,
    updated_at = now()
  WHERE id = v_invoice_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 2g. handle_deposit_billing_action, handle_proposal_approval, handle_unified_proposal_approval
-- These are trigger functions - use DO block to update 'sent' to 'submitted' in their source
DO $$
DECLARE
  v_func_src text;
  v_proname text;
BEGIN
  FOR v_proname IN
    SELECT proname FROM pg_proc
    WHERE proname IN ('handle_deposit_billing_action', 'handle_proposal_approval', 'handle_unified_proposal_approval')
  LOOP
    SELECT prosrc INTO v_func_src FROM pg_proc WHERE proname = v_proname LIMIT 1;
    IF v_func_src IS NOT NULL AND position('''sent''' in v_func_src) > 0 THEN
      v_func_src := replace(v_func_src, '''sent''', '''submitted''');
      EXECUTE format(
        'CREATE OR REPLACE FUNCTION %I() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS %L',
        v_proname, v_func_src
      );
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- 3. submit_invoice() RPC function
-- ============================================================

CREATE OR REPLACE FUNCTION submit_invoice(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice RECORD;
  v_line_items RECORD;
  v_calc_result jsonb;
  v_tax_amount numeric;
  v_subtotal numeric;
  v_total numeric;
  v_portal_enabled boolean;
  v_portal_visible boolean;
  v_errors text[] := ARRAY[]::text[];
  v_has_positive_amount boolean;
  v_taxable_subtotal numeric;
  v_assigned_number text;
BEGIN
  SELECT * INTO v_invoice
  FROM invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'errors', ARRAY['Invoice not found']);
  END IF;

  IF v_invoice.status <> 'draft' THEN
    RETURN jsonb_build_object('success', false, 'errors', ARRAY['Invoice must be in draft status to submit']);
  END IF;

  IF v_invoice.contact_id IS NULL THEN
    v_errors := array_append(v_errors, 'Customer is required');
  END IF;

  IF v_invoice.invoice_date IS NULL THEN
    v_errors := array_append(v_errors, 'Invoice date is required');
  END IF;
  IF v_invoice.due_date IS NULL THEN
    v_errors := array_append(v_errors, 'Due date is required');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM invoice_line_items WHERE invoice_id = p_invoice_id) THEN
    v_errors := array_append(v_errors, 'At least one line item is required');
  ELSE
    FOR v_line_items IN
      SELECT description, amount, quantity, tax_classification_id, item_type
      FROM invoice_line_items WHERE invoice_id = p_invoice_id
    LOOP
      IF v_line_items.description IS NULL OR v_line_items.description = '' THEN
        v_errors := array_append(v_errors, 'All line items must have a description');
      END IF;
      IF v_line_items.quantity <= 0 THEN
        v_errors := array_append(v_errors, 'Line item ''' || COALESCE(v_line_items.description, 'unnamed') || ''' must have a positive quantity');
      END IF;
    END LOOP;
  END IF;

  IF array_length(v_errors, 1) IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'errors', to_jsonb(v_errors));
  END IF;

  BEGIN
    v_calc_result := calculate_tax_context('invoice', p_invoice_id);
    v_tax_amount := COALESCE((v_calc_result->>'tax_amount')::numeric, 0);
    v_taxable_subtotal := COALESCE((v_calc_result->>'taxable_subtotal')::numeric, 0);
  EXCEPTION WHEN OTHERS THEN
    v_tax_amount := 0;
    v_taxable_subtotal := 0;
  END;

  IF v_calc_result->>'tax_calculation_status' = 'review_required' AND v_taxable_subtotal > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'errors', ARRAY['Tax calculation requires review. Please resolve tax configuration before submitting this invoice.']
    );
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_subtotal
  FROM invoice_line_items WHERE invoice_id = p_invoice_id;

  v_total := v_subtotal + v_tax_amount;

  SELECT COALESCE(portal_invoices_enabled, false) INTO v_portal_enabled
  FROM company_settings
  WHERE organization_id = v_invoice.organization_id
  LIMIT 1;

  IF v_total - COALESCE(v_invoice.amount_paid, 0) > 0 AND v_portal_enabled THEN
    v_portal_visible := true;
  ELSE
    v_portal_visible := false;
  END IF;

  UPDATE invoices
  SET
    status = 'submitted',
    subtotal = v_subtotal,
    tax_amount = v_tax_amount,
    total = v_total,
    amount_due = v_total - COALESCE(amount_paid, 0),
    portal_visible = v_portal_visible,
    tax_calculation_status = COALESCE(v_calc_result->>'tax_calculation_status', 'ready'),
    tax_review_required = (v_calc_result->>'tax_calculation_status' = 'review_required'),
    updated_at = now()
  WHERE id = p_invoice_id;

  SELECT invoice_number INTO v_assigned_number FROM invoices WHERE id = p_invoice_id;

  RETURN jsonb_build_object(
    'success', true,
    'invoice_number', v_assigned_number,
    'portal_visible', v_portal_visible
  );
END;
$$;

-- ============================================================
-- 4. void_invoice() RPC function
-- ============================================================

CREATE OR REPLACE FUNCTION void_invoice(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice RECORD;
BEGIN
  SELECT * INTO v_invoice
  FROM invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'errors', ARRAY['Invoice not found']);
  END IF;

  IF v_invoice.status NOT IN ('submitted', 'partial', 'paid', 'overdue') THEN
    RETURN jsonb_build_object('success', false, 'errors', ARRAY['Only submitted, partial, paid, or overdue invoices can be voided']);
  END IF;

  UPDATE invoices
  SET
    status = 'void',
    portal_visible = false,
    updated_at = now()
  WHERE id = p_invoice_id;

  RETURN jsonb_build_object('success', true, 'invoice_number', v_invoice.invoice_number);
END;
$$;

-- ============================================================
-- 5. Portal RLS Policy Replacement
-- ============================================================

DROP POLICY IF EXISTS "Portal users can view their invoices" ON invoices;
CREATE POLICY "Portal users can view their invoices"
  ON invoices FOR SELECT TO authenticated
  USING (
    portal_visible = true
    AND status IN ('submitted', 'partial', 'paid', 'overdue')
    AND contact_id IN (
      SELECT contacts.id FROM contacts
      WHERE contacts.portal_user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM company_settings cs
      WHERE cs.organization_id = (
        SELECT c.organization_id FROM contacts c
        WHERE c.id = invoices.contact_id
      )
      AND COALESCE(cs.portal_invoices_enabled, false) = true
    )
  );

-- ============================================================
-- 6. Internal Staff Visibility RLS Update
-- ============================================================

DROP POLICY IF EXISTS invoices_select_same_org ON invoices;
CREATE POLICY invoices_select_same_org ON invoices FOR SELECT TO authenticated
  USING (
    organization_id = get_user_org_id()
    AND (
      can_view_all_org_invoices()
      OR created_by = auth.uid()
    )
  );

-- ============================================================
-- 7. Post-Submit Locking Triggers
-- ============================================================

CREATE OR REPLACE FUNCTION prevent_post_submit_field_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(OLD.status, 'draft') <> 'draft' AND NEW.status = OLD.status THEN
    IF NEW.contact_id IS DISTINCT FROM OLD.contact_id THEN
      RAISE EXCEPTION 'Cannot modify customer on a submitted invoice. Void and recreate if needed.'
      USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.subtotal IS DISTINCT FROM OLD.subtotal
       OR NEW.tax_amount IS DISTINCT FROM OLD.tax_amount
       OR NEW.total IS DISTINCT FROM OLD.total
       OR NEW.invoice_number IS DISTINCT FROM OLD.invoice_number
       OR NEW.invoice_date IS DISTINCT FROM OLD.invoice_date
       OR NEW.due_date IS DISTINCT FROM OLD.due_date
       OR NEW.tax_snapshot_id IS DISTINCT FROM OLD.tax_snapshot_id
       OR NEW.tax_environment IS DISTINCT FROM OLD.tax_environment
       OR NEW.tax_project_type IS DISTINCT FROM OLD.tax_project_type
       OR NEW.tax_rate IS DISTINCT FROM OLD.tax_rate
       OR NEW.tax_jurisdiction_id IS DISTINCT FROM OLD.tax_jurisdiction_id
       OR NEW.billing_name IS DISTINCT FROM OLD.billing_name
       OR NEW.billing_address_line1 IS DISTINCT FROM OLD.billing_address_line1
       OR NEW.billing_address_line2 IS DISTINCT FROM OLD.billing_address_line2
       OR NEW.billing_city IS DISTINCT FROM OLD.billing_city
       OR NEW.billing_state IS DISTINCT FROM OLD.billing_state
       OR NEW.billing_zip IS DISTINCT FROM OLD.billing_zip
       OR NEW.jobsite_address IS DISTINCT FROM OLD.jobsite_address
       OR NEW.jobsite_city IS DISTINCT FROM OLD.jobsite_city
       OR NEW.jobsite_state IS DISTINCT FROM OLD.jobsite_state
       OR NEW.jobsite_zip IS DISTINCT FROM OLD.jobsite_zip
    THEN
      RAISE EXCEPTION 'Cannot modify accounting fields on a submitted invoice. Fields are locked after submission.'
      USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_post_submit_changes ON invoices;
CREATE TRIGGER trg_prevent_post_submit_changes
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION prevent_post_submit_field_changes();

CREATE OR REPLACE FUNCTION prevent_line_item_changes_on_submitted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_status text;
  v_inv_id uuid;
BEGIN
  v_inv_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.invoice_id ELSE NEW.invoice_id END;

  SELECT status INTO v_invoice_status
  FROM invoices WHERE id = v_inv_id;

  IF v_invoice_status IS NOT NULL AND v_invoice_status <> 'draft' THEN
    RAISE EXCEPTION 'Cannot % line items on a submitted invoice. Line items are locked after submission.',
      TG_OP
    USING ERRCODE = 'check_violation';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trg_lock_line_items_insert ON invoice_line_items;
CREATE TRIGGER trg_lock_line_items_insert
  BEFORE INSERT ON invoice_line_items
  FOR EACH ROW
  EXECUTE FUNCTION prevent_line_item_changes_on_submitted();

DROP TRIGGER IF EXISTS trg_lock_line_items_update ON invoice_line_items;
CREATE TRIGGER trg_lock_line_items_update
  BEFORE UPDATE ON invoice_line_items
  FOR EACH ROW
  EXECUTE FUNCTION prevent_line_item_changes_on_submitted();

DROP TRIGGER IF EXISTS trg_lock_line_items_delete ON invoice_line_items;
CREATE TRIGGER trg_lock_line_items_delete
  BEFORE DELETE ON invoice_line_items
  FOR EACH ROW
  EXECUTE FUNCTION prevent_line_item_changes_on_submitted();

-- ============================================================
-- 8. Delete Policy: only drafts can be deleted
-- ============================================================

DROP POLICY IF EXISTS invoices_delete_same_org ON invoices;
CREATE POLICY invoices_delete_same_org ON invoices FOR DELETE TO authenticated
  USING (
    organization_id = get_user_org_id()
    AND status = 'draft'
  );

DROP POLICY IF EXISTS "Users can delete company invoices" ON invoices;
CREATE POLICY "Users can delete company invoices" ON invoices FOR DELETE TO authenticated
  USING (
    organization_id = get_user_org_id()
    AND status = 'draft'
  );
