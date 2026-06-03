/*
  # Pre-create Draft Invoices for Custom Billing Phases on Proposal Approval

  ## Summary
  When a proposal with `deposit_type = 'custom'` is approved and a sales order is
  created, automatically pre-create one draft invoice per billing phase defined in
  `proposal_billing_phases`. These drafts are NOT sent to the customer — they are
  placeholders for the user to review, modify, and send manually.

  ## Changes

  ### Modified Functions
  1. `handle_unified_proposal_approval` — After creating the sales order and project,
     loops through `proposal_billing_phases` ordered by `phase_order` and inserts a
     draft invoice for each phase. Each invoice:
     - Has `status = 'draft'`
     - Has `source_type = 'billing_phase'`
     - Has `invoice_type = 'progress'`
     - Amount is computed from `amount_type`:
       - `percentage`: proposal total × (amount / 100)
       - `fixed`: raw amount value
     - Is linked to proposal, contact, sales order, project, and organization

  ### Notes
  - For non-custom deposit types the behavior is completely unchanged.
  - The loop runs inside a sub-BEGIN/EXCEPTION block so a phase insert failure
    raises a warning but does NOT roll back the sales order.
  - Each draft invoice gets one line item describing the billing phase.
*/

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
  v_phase               record;
  v_phase_amount        numeric;
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

        -- Only create a deposit invoice for non-custom deposit types
        IF NEW.deposit_type != 'custom' AND v_deposit_amount > 0 THEN
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

        -- Only create a deposit invoice for non-custom deposit types
        IF NEW.deposit_type != 'custom' AND v_deposit_amount > 0 THEN
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

      -- Link deposit invoice to sales order
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
          'planning',
          NEW.created_by,
          NEW.jobsite_location,
          'Project created from approved proposal ' || NEW.proposal_number,
          NEW.approved_by,
          NEW.created_by
        ) RETURNING id INTO v_project_id;

        UPDATE sales_orders SET project_id = v_project_id WHERE id = v_sales_order_id;

        IF v_invoice_id IS NOT NULL THEN
          UPDATE invoices SET project_id = v_project_id WHERE id = v_invoice_id;
        END IF;

      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Failed to create project for proposal %: %', NEW.proposal_number, SQLERRM;
      END;

      -- Pre-create draft invoices for custom billing phases
      IF NEW.deposit_type = 'custom' THEN
        BEGIN
          FOR v_phase IN
            SELECT * FROM proposal_billing_phases
            WHERE proposal_id = NEW.id
            ORDER BY phase_order
          LOOP
            -- Compute phase amount
            IF v_phase.amount_type = 'percentage' THEN
              v_phase_amount := COALESCE(NEW.total, 0) * (v_phase.amount / 100.0);
            ELSE
              v_phase_amount := v_phase.amount;
            END IF;

            v_invoice_number := generate_invoice_number();

            INSERT INTO invoices (
              company_id, organization_id,
              proposal_id, contact_id,
              sales_order_id, project_id,
              invoice_number, invoice_type,
              invoice_date, source_type,
              subtotal, tax_amount, tax_rate,
              tax_environment, tax_project_type,
              total, amount_due, status, payment_terms, notes, created_by
            ) VALUES (
              NEW.company_id, NEW.organization_id,
              NEW.id, NEW.contact_id,
              v_sales_order_id, v_project_id,
              v_invoice_number, 'progress',
              CURRENT_DATE, 'billing_phase',
              v_phase_amount, 0, COALESCE(NEW.tax_rate, 0),
              COALESCE(NEW.tax_environment, 'residential'),
              COALESCE(NEW.tax_project_type, 'general_installation_repair'),
              v_phase_amount, v_phase_amount, 'draft',
              COALESCE(NEW.payment_terms, 'Due upon receipt'),
              'Billing phase: ' || COALESCE(v_phase.title, 'Phase ' || (v_phase.phase_order + 1)) ||
              CASE WHEN v_phase.amount_type = 'percentage'
                   THEN ' (' || v_phase.amount || '% of contract)'
                   ELSE '' END,
              NEW.approved_by
            ) RETURNING id INTO v_invoice_id;

            INSERT INTO invoice_line_items (
              invoice_id, organization_id,
              description, quantity, unit_price, amount, is_taxable
            ) VALUES (
              v_invoice_id, NEW.organization_id,
              COALESCE(v_phase.title, 'Billing Phase') || ' — Proposal ' || NEW.proposal_number ||
              CASE WHEN v_phase.notes IS NOT NULL AND v_phase.notes != ''
                   THEN ': ' || v_phase.notes
                   ELSE '' END,
              1, v_phase_amount, v_phase_amount, false
            );

          END LOOP;
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'Failed to create billing phase draft invoices for proposal %: %', NEW.proposal_number, SQLERRM;
        END;
      END IF;

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
              WHEN NEW.deposit_type = 'custom' THEN
                'Custom billing phase invoices created as drafts. Sales order is ready for scheduling.'
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
