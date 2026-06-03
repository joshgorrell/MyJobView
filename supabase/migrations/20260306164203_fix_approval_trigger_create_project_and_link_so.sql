/*
  # Fix Proposal Approval Trigger to Create Project and Link Sales Order

  ## Problem
  The `handle_unified_proposal_approval` trigger creates a sales order when a proposal
  is approved, but it never:
  1. Creates a project record
  2. Sets `sales_orders.project_id` to link back to the project
  3. Sets `project_id` on the deposit invoice

  This means the Sales Order > Project tab and Commissions tab always appear empty,
  because the data loading relies on `projects.sales_order_id` and `invoices.project_id`.

  ## Changes
  1. Rewrites `handle_unified_proposal_approval` to:
     - Create a project after creating the sales order
     - Set `sales_orders.project_id = v_project_id`
     - Set `project_id` on the deposit invoice
     - Copy `salesperson_id` from proposal's `created_by` onto the project
  2. Also updates `complete_po_pending_approval` trigger to create a project
     and set `sales_orders.project_id`

  ## Data Fixed
  - Julio's invoice (`7080377d`) gets `project_id` set so the commission trigger can fire
*/

-- ============================================================
-- 1. Rewrite handle_unified_proposal_approval
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_unified_proposal_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sales_order_id      uuid;
  v_order_number        text;
  v_invoice_id          uuid;
  v_invoice_number      text;
  v_deposit_amount      numeric;
  v_require_deposit     boolean;
  v_accepted_via_method text;
  v_customer_name       text;
  v_sales_order_status  text;
  v_project_id          uuid;
  v_project_number      text;
BEGIN
  IF NEW.status = 'approved'
    AND OLD.status != 'approved'
    AND NEW.sales_order_id IS NULL
    AND (NEW.billing_action_taken = false OR NEW.sales_order_id IS NULL)
  THEN

    BEGIN

      SELECT COALESCE(full_name, contact_name, email, 'Customer')
      INTO v_customer_name
      FROM contacts
      WHERE id = NEW.contact_id;

      v_require_deposit     := COALESCE(NEW.require_deposit, true);
      v_deposit_amount      := COALESCE(NEW.deposit_amount_due, 0);
      v_accepted_via_method := COALESCE(NEW.accepted_via_method, 'verbal');

      IF NEW.accepted_via_method IS NULL THEN
        NEW.accepted_via_method := 'verbal';
      END IF;

      IF NEW.approval_completed_at IS NULL THEN
        NEW.approval_completed_at := now();
      END IF;

      v_order_number := generate_sales_order_number(NEW.proposal_number);

      IF v_accepted_via_method = 'purchase_order' THEN
        v_sales_order_status    := 'planning';
        NEW.billing_action_type := 'purchase_order';

        IF NEW.purchase_order_number IS NULL OR NEW.purchase_order_number = '' THEN
          RAISE EXCEPTION 'Purchase Order number is required for PO acceptance';
        END IF;

      ELSIF NOT v_require_deposit THEN
        v_sales_order_status    := 'planning';
        NEW.billing_action_type := 'no_deposit_required';

      ELSIF NEW.deposit_paid THEN
        v_sales_order_status    := 'planning';
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

          INSERT INTO invoice_line_items (
            invoice_id, organization_id,
            description, quantity, unit_price, amount, is_taxable
          ) VALUES (
            v_invoice_id, NEW.organization_id,
            'Deposit for Proposal ' || NEW.proposal_number,
            1, v_deposit_amount, v_deposit_amount, false
          );

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
        v_sales_order_status        := 'pending_deposit';
        NEW.billing_action_type     := 'deposit_invoice';
        NEW.deposit_request_sent    := true;
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

          INSERT INTO invoice_line_items (
            invoice_id, organization_id,
            description, quantity, unit_price, amount, is_taxable
          ) VALUES (
            v_invoice_id, NEW.organization_id,
            'Deposit for Proposal ' || NEW.proposal_number,
            1, v_deposit_amount, v_deposit_amount, false
          );

          NEW.deposit_invoice_id := v_invoice_id;
        END IF;
      END IF;

      -- Create Sales Order
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

      NEW.sales_order_id := v_sales_order_id;

      -- Link deposit invoice to sales order and set project_id (will update after project creation)
      IF v_invoice_id IS NOT NULL THEN
        UPDATE invoices SET sales_order_id = v_sales_order_id WHERE id = v_invoice_id;
      END IF;

      -- Create Project linked to this sales order
      BEGIN
        v_project_number := get_next_project_number();

        INSERT INTO projects (
          company_id, organization_id,
          sales_order_id, contact_id,
          project_number, name,
          status, assigned_pm,
          job_site_address, notes, created_by,
          salesperson_id
        ) VALUES (
          NEW.company_id, NEW.organization_id,
          v_sales_order_id, NEW.contact_id,
          v_project_number,
          COALESCE(NEW.title, 'Project for ' || v_customer_name),
          CASE WHEN v_sales_order_status = 'planning' THEN 'planning' ELSE 'planning' END,
          NEW.created_by,
          NEW.jobsite_location,
          'Project created from approved proposal ' || NEW.proposal_number,
          NEW.approved_by,
          NEW.created_by
        ) RETURNING id INTO v_project_id;

        -- Link sales order back to project
        UPDATE sales_orders SET project_id = v_project_id WHERE id = v_sales_order_id;

        -- Set project_id on deposit invoice now that project exists
        IF v_invoice_id IS NOT NULL THEN
          UPDATE invoices SET project_id = v_project_id WHERE id = v_invoice_id;
        END IF;

      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Failed to create project for proposal %: %', NEW.proposal_number, SQLERRM;
      END;

      NEW.billing_action_taken := true;
      NEW.billing_action_at    := now();
      NEW.billing_action_by    := NEW.approved_by;

      IF NEW.approved_by IS DISTINCT FROM NEW.created_by THEN
        BEGIN
          INSERT INTO notifications (user_id, type, title, message, related_id)
          VALUES (
            NEW.created_by,
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
      RAISE EXCEPTION 'Proposal approval failed while creating sales order: %', SQLERRM;
    END;

  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- 2. Also fix complete_po_pending_approval to create a project
-- ============================================================
CREATE OR REPLACE FUNCTION public.complete_po_pending_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sales_order_id uuid;
  v_order_number   text;
  v_customer_name  text;
  v_project_id     uuid;
  v_project_number text;
BEGIN
  IF NEW.purchase_order_number IS NOT NULL
    AND NEW.purchase_order_number != ''
    AND OLD.po_pending = true
    AND NEW.po_pending = true
    AND NEW.sales_order_id IS NULL
  THEN
    NEW.po_pending := false;
    NEW.billing_action_type := 'purchase_order';

    SELECT COALESCE(full_name, contact_name, email, 'Customer')
    INTO v_customer_name
    FROM contacts
    WHERE id = NEW.contact_id;

    v_order_number := generate_sales_order_number(NEW.proposal_number);

    INSERT INTO sales_orders (
      organization_id,
      proposal_id,
      contact_id,
      order_number,
      status,
      contract_total,
      payment_terms,
      notes,
      created_by
    ) VALUES (
      NEW.organization_id,
      NEW.id,
      NEW.contact_id,
      v_order_number,
      'planning',
      NEW.total,
      COALESCE(NEW.payment_terms, 'Net 30'),
      'Converted from proposal ' || NEW.proposal_number || ' - PO: ' || NEW.purchase_order_number,
      auth.uid()
    ) RETURNING id INTO v_sales_order_id;

    NEW.sales_order_id := v_sales_order_id;
    NEW.billing_action_taken := true;
    NEW.billing_action_at := now();
    NEW.billing_action_by := auth.uid();

    -- Create Project
    BEGIN
      v_project_number := get_next_project_number();

      INSERT INTO projects (
        organization_id,
        sales_order_id, contact_id,
        project_number, name,
        status, assigned_pm,
        job_site_address, notes, created_by,
        salesperson_id
      ) VALUES (
        NEW.organization_id,
        v_sales_order_id, NEW.contact_id,
        v_project_number,
        COALESCE(NEW.title, 'Project for ' || v_customer_name),
        'planning',
        NEW.created_by,
        NEW.jobsite_location,
        'Project created from approved proposal ' || NEW.proposal_number || ' - PO: ' || NEW.purchase_order_number,
        auth.uid(),
        NEW.created_by
      ) RETURNING id INTO v_project_id;

      UPDATE sales_orders SET project_id = v_project_id WHERE id = v_sales_order_id;

    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to create project for PO approval %: %', NEW.proposal_number, SQLERRM;
    END;

    BEGIN
      INSERT INTO notifications (
        user_id,
        type,
        title,
        message,
        related_id
      ) VALUES (
        NEW.created_by,
        'proposal_approved',
        'PO Number Received',
        'PO #' || NEW.purchase_order_number || ' received for proposal ' || NEW.proposal_number || '. Sales order ' || v_order_number || ' created and ready for scheduling.',
        NEW.id
      );
    EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'Failed to create PO received notification: %', SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$;
