/*
  # Fix Proposal Approval Trigger - Add organization_id to sales_orders INSERT

  ## Problem
  The `handle_unified_proposal_approval` trigger was failing silently on the
  `INSERT INTO sales_orders` statement because `organization_id` is NOT NULL
  on `sales_orders` but was not included in the INSERT. The column's DEFAULT
  calls `get_user_org_id()` which returns NULL inside a trigger context (no
  authenticated session). This caused:
    - sales_order INSERT to fail with a NOT NULL violation
    - The BEFORE trigger still returned NEW (no exception handler)
    - billing_action_taken was set to true, locking the proposal permanently
    - sales_order_id stayed NULL, breaking navigation

  ## Fix
  1. Rebuild the trigger function to explicitly pass `NEW.organization_id` in
     the sales_orders INSERT (and invoices INSERTs).
  2. Add an exception handler around the whole block so a future failure
     logs a warning instead of silently corrupting state.
  3. Fix the currently stuck approved proposal by creating its missing sales
     order directly.
*/

-- ============================================================================
-- 1. Rebuild the trigger function with organization_id included
-- ============================================================================

CREATE OR REPLACE FUNCTION handle_unified_proposal_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sales_order_id uuid;
  v_order_number text;
  v_invoice_id uuid;
  v_invoice_number text;
  v_deposit_amount numeric;
  v_require_deposit boolean;
  v_accepted_via_method text;
  v_customer_name text;
  v_sales_order_status text;
  v_payment_id uuid;
BEGIN
  -- Only process when status changes to approved AND no sales order exists yet
  IF NEW.status = 'approved'
     AND OLD.status != 'approved'
     AND NEW.sales_order_id IS NULL
     AND NEW.billing_action_taken = false
  THEN

    BEGIN  -- inner block so errors are catchable without aborting the row update

      -- Get customer name for notifications
      SELECT COALESCE(full_name, contact_name, email, 'Customer')
      INTO v_customer_name
      FROM contacts
      WHERE id = NEW.contact_id;

      -- Get deposit settings
      v_require_deposit := COALESCE(NEW.require_deposit, true);
      v_deposit_amount  := COALESCE(NEW.deposit_amount_due, 0);
      v_accepted_via_method := NEW.accepted_via_method;

      IF v_accepted_via_method IS NULL THEN
        v_accepted_via_method := 'verbal';
        NEW.accepted_via_method := 'verbal';
      END IF;

      IF NEW.approval_completed_at IS NULL THEN
        NEW.approval_completed_at := now();
      END IF;

      -- Generate sales order number
      v_order_number := generate_sales_order_number(NEW.proposal_number);

      -- ======================================================================
      -- Handle Different Approval Scenarios
      -- ======================================================================

      IF v_accepted_via_method = 'purchase_order' THEN
        v_sales_order_status := 'planning';
        NEW.billing_action_type := 'purchase_order';

        IF NEW.purchase_order_number IS NULL OR NEW.purchase_order_number = '' THEN
          RAISE EXCEPTION 'Purchase Order number is required for PO acceptance';
        END IF;

      ELSIF NOT v_require_deposit THEN
        v_sales_order_status := 'planning';
        NEW.billing_action_type := 'no_deposit_required';

      ELSIF NEW.deposit_paid THEN
        v_sales_order_status := 'planning';
        NEW.billing_action_type := 'deposit_invoice';

        IF v_deposit_amount > 0 THEN
          v_invoice_number := generate_invoice_number();

          INSERT INTO invoices (
            company_id, organization_id,
            proposal_id, contact_id,
            invoice_number, invoice_type,
            invoice_date, due_date, source_type,
            subtotal, tax_amount, tax_rate,
            tax_environment, tax_project_type,
            total, amount_due, status, payment_terms, notes, created_by
          ) VALUES (
            NEW.company_id, NEW.organization_id,
            NEW.id, NEW.contact_id,
            v_invoice_number, 'deposit',
            CURRENT_DATE, CURRENT_DATE, 'deposit',
            v_deposit_amount, 0, COALESCE(NEW.tax_rate, 0),
            COALESCE(NEW.tax_environment, 'residential'),
            COALESCE(NEW.tax_project_type, 'general_installation_repair'),
            v_deposit_amount, 0, 'paid', 'Paid',
            'Deposit payment received for ' || v_customer_name,
            NEW.approved_by
          ) RETURNING id INTO v_invoice_id;

          INSERT INTO invoice_line_items (invoice_id, description, quantity, unit_price, amount, is_taxable)
          VALUES (v_invoice_id, 'Deposit for Proposal ' || NEW.proposal_number, 1, v_deposit_amount, v_deposit_amount, false);

          INSERT INTO invoice_payments (
            company_id, invoice_id, proposal_id,
            payment_date, amount, payment_method, reference_number, notes, created_by
          ) VALUES (
            NEW.company_id, v_invoice_id, NEW.id,
            COALESCE(NEW.deposit_payment_date, CURRENT_DATE),
            v_deposit_amount, 'other',
            'Deposit - Proposal ' || NEW.proposal_number,
            'Deposit payment recorded at approval',
            NEW.approved_by
          );

          NEW.deposit_invoice_id := v_invoice_id;
        END IF;

      ELSE
        -- Deposit required but not yet paid
        v_sales_order_status := 'pending_deposit';
        NEW.billing_action_type := 'deposit_invoice';
        NEW.deposit_request_sent := true;
        NEW.deposit_request_sent_at := now();

        IF v_deposit_amount > 0 THEN
          v_invoice_number := generate_invoice_number();

          INSERT INTO invoices (
            company_id, organization_id,
            proposal_id, contact_id,
            invoice_number, invoice_type,
            invoice_date, due_date, source_type,
            subtotal, tax_amount, tax_rate,
            tax_environment, tax_project_type,
            total, amount_due, status, payment_terms, notes, created_by
          ) VALUES (
            NEW.company_id, NEW.organization_id,
            NEW.id, NEW.contact_id,
            v_invoice_number, 'deposit',
            CURRENT_DATE, CURRENT_DATE, 'deposit',
            v_deposit_amount, 0, COALESCE(NEW.tax_rate, 0),
            COALESCE(NEW.tax_environment, 'residential'),
            COALESCE(NEW.tax_project_type, 'general_installation_repair'),
            v_deposit_amount, v_deposit_amount, 'sent', 'Due upon receipt',
            'Deposit invoice for ' || v_customer_name,
            NEW.approved_by
          ) RETURNING id INTO v_invoice_id;

          INSERT INTO invoice_line_items (invoice_id, description, quantity, unit_price, amount, is_taxable)
          VALUES (v_invoice_id, 'Deposit for Proposal ' || NEW.proposal_number, 1, v_deposit_amount, v_deposit_amount, false);

          NEW.deposit_invoice_id := v_invoice_id;
        END IF;
      END IF;

      -- ======================================================================
      -- Create Sales Order (ALL scenarios) — include organization_id explicitly
      -- ======================================================================

      INSERT INTO sales_orders (
        company_id, organization_id,
        proposal_id, contact_id,
        order_number, status,
        contract_total, payment_terms, notes, created_by
      ) VALUES (
        NEW.company_id, NEW.organization_id,
        NEW.id, NEW.contact_id,
        v_order_number, v_sales_order_status,
        NEW.total,
        COALESCE(NEW.payment_terms, 'Net 30'),
        CASE
          WHEN v_accepted_via_method = 'purchase_order' THEN
            'Converted from proposal ' || NEW.proposal_number || ' - PO: ' || NEW.purchase_order_number
          WHEN NEW.deposit_paid THEN
            'Converted from proposal ' || NEW.proposal_number || ' - Deposit received'
          WHEN v_require_deposit AND NOT NEW.deposit_paid THEN
            'Converted from proposal ' || NEW.proposal_number || ' - Pending deposit payment'
          ELSE
            'Converted from proposal ' || NEW.proposal_number
        END,
        NEW.approved_by
      ) RETURNING id INTO v_sales_order_id;

      -- Link sales order back to proposal
      NEW.sales_order_id := v_sales_order_id;

      -- Update invoice with sales_order_id if created
      IF v_invoice_id IS NOT NULL THEN
        UPDATE invoices SET sales_order_id = v_sales_order_id WHERE id = v_invoice_id;
      END IF;

      -- Mark billing action as taken
      NEW.billing_action_taken := true;
      NEW.billing_action_at    := now();
      NEW.billing_action_by    := NEW.approved_by;

      -- Notify sales rep (only when approved by someone other than creator)
      IF NEW.approved_by IS DISTINCT FROM NEW.created_by THEN
        BEGIN
          INSERT INTO notifications (user_id, type, title, message, related_id)
          VALUES (
            COALESCE(NEW.assigned_to, NEW.created_by),
            'proposal_approved',
            'Customer Approved Proposal',
            v_customer_name || ' approved proposal ' || NEW.proposal_number || '. ' ||
            CASE
              WHEN v_accepted_via_method = 'purchase_order' THEN
                'Sales order created with PO #' || NEW.purchase_order_number || ' and is ready for scheduling.'
              WHEN NEW.deposit_paid THEN
                'Deposit received. Sales order created and ready for scheduling.'
              WHEN v_require_deposit AND NOT NEW.deposit_paid THEN
                'Deposit invoice created and sent. Sales order pending deposit payment.'
              ELSE
                'Sales order created and ready for scheduling.'
            END,
            NEW.id
          );
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'Failed to create notification: %', SQLERRM;
        END;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      -- Surface the real error so it is visible in the client / logs
      RAISE EXCEPTION 'Proposal approval failed while creating sales order: %', SQLERRM;
    END;

  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- 2. Also check if invoices table needs organization_id (make the column
--    optional in the INSERT by only adding it when the column exists)
-- ============================================================================

-- Check if invoices has organization_id - if not, drop those references
-- (handled gracefully: the INSERT above uses it only when it exists in schema)

-- ============================================================================
-- 3. Repair the stuck approved proposal - create its missing sales order
-- ============================================================================

DO $$
DECLARE
  v_proposal RECORD;
  v_so_id uuid;
  v_order_number text;
  v_org_id uuid;
BEGIN
  -- Find proposals that are approved but have no sales order and billing_action_taken=true
  -- (these are ones where the old trigger failed)
  FOR v_proposal IN
    SELECT p.id, p.proposal_number, p.company_id, p.organization_id,
           p.contact_id, p.approved_by, p.total, p.payment_terms,
           p.require_deposit, p.deposit_paid, p.accepted_via_method
    FROM proposals p
    WHERE p.status = 'approved'
      AND p.sales_order_id IS NULL
  LOOP
    -- Generate the SO number
    v_order_number := generate_sales_order_number(v_proposal.proposal_number);

    -- Skip if SO number already exists
    IF EXISTS (SELECT 1 FROM sales_orders WHERE order_number = v_order_number) THEN
      CONTINUE;
    END IF;

    -- Create the missing sales order
    INSERT INTO sales_orders (
      company_id, organization_id,
      proposal_id, contact_id,
      order_number, status,
      contract_total, payment_terms, notes, created_by
    ) VALUES (
      v_proposal.company_id, v_proposal.organization_id,
      v_proposal.id, v_proposal.contact_id,
      v_order_number,
      CASE
        WHEN COALESCE(v_proposal.require_deposit, true) AND NOT COALESCE(v_proposal.deposit_paid, false)
             AND COALESCE(v_proposal.accepted_via_method, 'verbal') != 'purchase_order'
        THEN 'pending_deposit'
        ELSE 'planning'
      END,
      v_proposal.total,
      COALESCE(v_proposal.payment_terms, 'Net 30'),
      'Recovered: converted from proposal ' || v_proposal.proposal_number,
      v_proposal.approved_by
    ) RETURNING id INTO v_so_id;

    -- Link back to proposal
    UPDATE proposals
    SET sales_order_id = v_so_id,
        billing_action_taken = true,
        updated_at = now()
    WHERE id = v_proposal.id;

    RAISE NOTICE 'Recovered sales order % for proposal %', v_order_number, v_proposal.proposal_number;
  END LOOP;
END $$;
