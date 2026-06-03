/*
  # Fix Proposal Approval Invoice Tax Fields

  ## Problem
  When proposals are approved, the automatic invoice creation was failing with:
  "null value in column "tax_environment" of relation "invoices" violates not-null constraint"

  This is because the handle_unified_proposal_approval() function creates invoices
  but doesn't include the required tax_environment and tax_project_type fields.

  ## Solution
  Update the function to include these fields when creating deposit invoices.
  Values are inherited from the proposal.

  ## Changes
  - Update handle_unified_proposal_approval() to include tax_environment and tax_project_type
  - Use proposal values or default to 'residential' and 'general_installation_repair'
*/

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

    -- Get customer name for notifications
    SELECT COALESCE(full_name, contact_name, email, 'Customer')
    INTO v_customer_name
    FROM contacts
    WHERE id = NEW.contact_id;

    -- Get deposit settings from proposal (proposal-level overrides template)
    v_require_deposit := COALESCE(NEW.require_deposit, true);
    v_deposit_amount := COALESCE(NEW.deposit_amount_due, 0);
    v_accepted_via_method := NEW.accepted_via_method;

    -- If no acceptance method specified, default to 'verbal' for manual approvals
    IF v_accepted_via_method IS NULL THEN
      v_accepted_via_method := 'verbal';
      NEW.accepted_via_method := 'verbal';
    END IF;

    -- Set approval timestamp if not set
    IF NEW.approval_completed_at IS NULL THEN
      NEW.approval_completed_at := now();
    END IF;

    -- Generate sales order number
    v_order_number := generate_sales_order_number(NEW.proposal_number);

    -- ========================================================================
    -- Handle Different Approval Scenarios
    -- ========================================================================

    IF v_accepted_via_method = 'purchase_order' THEN
      -- ====== PURCHASE ORDER FLOW ======
      -- No deposit required for PO customers, no invoice created
      v_sales_order_status := 'planning';
      NEW.billing_action_type := 'purchase_order';

      -- Validate PO number exists
      IF NEW.purchase_order_number IS NULL OR NEW.purchase_order_number = '' THEN
        RAISE EXCEPTION 'Purchase Order number is required for PO acceptance';
      END IF;

    ELSIF NOT v_require_deposit THEN
      -- ====== NO DEPOSIT REQUIRED FLOW ======
      -- Create sales order, no invoice needed
      v_sales_order_status := 'planning';
      NEW.billing_action_type := 'no_deposit_required';

    ELSIF NEW.deposit_paid THEN
      -- ====== DEPOSIT ALREADY PAID FLOW ======
      -- Create paid invoice and sales order ready for scheduling
      v_sales_order_status := 'planning';
      NEW.billing_action_type := 'deposit_invoice';

      -- Create paid invoice
      IF v_deposit_amount > 0 THEN
        v_invoice_number := generate_invoice_number();

        INSERT INTO invoices (
          company_id,
          proposal_id,
          contact_id,
          invoice_number,
          invoice_type,
          invoice_date,
          due_date,
          source_type,
          subtotal,
          tax_amount,
          tax_rate,
          tax_environment,
          tax_project_type,
          total,
          amount_due,
          status,
          payment_terms,
          notes,
          created_by
        ) VALUES (
          NEW.company_id,
          NEW.id,
          NEW.contact_id,
          v_invoice_number,
          'deposit',
          CURRENT_DATE,
          CURRENT_DATE,
          'deposit',
          v_deposit_amount,
          0,
          COALESCE(NEW.tax_rate, 0),
          COALESCE(NEW.tax_environment, 'residential'),
          COALESCE(NEW.tax_project_type, 'general_installation_repair'),
          v_deposit_amount,
          0, -- amount_due is 0 because it's paid
          'paid',
          'Paid',
          'Deposit payment received for ' || v_customer_name,
          NEW.approved_by
        ) RETURNING id INTO v_invoice_id;

        -- Add invoice line item
        INSERT INTO invoice_line_items (
          invoice_id,
          description,
          quantity,
          unit_price,
          amount,
          taxable
        ) VALUES (
          v_invoice_id,
          'Deposit for Proposal ' || NEW.proposal_number,
          1,
          v_deposit_amount,
          v_deposit_amount,
          false
        );

        -- Create payment record
        INSERT INTO invoice_payments (
          company_id,
          invoice_id,
          proposal_id,
          payment_date,
          amount,
          payment_method,
          reference_number,
          notes,
          created_by
        ) VALUES (
          NEW.company_id,
          v_invoice_id,
          NEW.id,
          COALESCE(NEW.deposit_payment_date, CURRENT_DATE),
          v_deposit_amount,
          'other',
          'Deposit - Proposal ' || NEW.proposal_number,
          'Deposit payment recorded at approval',
          NEW.approved_by
        );

        NEW.deposit_invoice_id := v_invoice_id;
      END IF;

    ELSE
      -- ====== DEPOSIT REQUIRED BUT NOT PAID FLOW ======
      -- Create deposit invoice and sales order pending deposit
      v_sales_order_status := 'pending_deposit';
      NEW.billing_action_type := 'deposit_invoice';
      NEW.deposit_request_sent := true;
      NEW.deposit_request_sent_at := now();

      -- Create deposit invoice
      IF v_deposit_amount > 0 THEN
        v_invoice_number := generate_invoice_number();

        INSERT INTO invoices (
          company_id,
          proposal_id,
          contact_id,
          invoice_number,
          invoice_type,
          invoice_date,
          due_date,
          source_type,
          subtotal,
          tax_amount,
          tax_rate,
          tax_environment,
          tax_project_type,
          total,
          amount_due,
          status,
          payment_terms,
          notes,
          created_by
        ) VALUES (
          NEW.company_id,
          NEW.id,
          NEW.contact_id,
          v_invoice_number,
          'deposit',
          CURRENT_DATE,
          CURRENT_DATE,
          'deposit',
          v_deposit_amount,
          0,
          COALESCE(NEW.tax_rate, 0),
          COALESCE(NEW.tax_environment, 'residential'),
          COALESCE(NEW.tax_project_type, 'general_installation_repair'),
          v_deposit_amount,
          v_deposit_amount,
          'sent',
          'Due upon receipt',
          'Deposit invoice for ' || v_customer_name,
          NEW.approved_by
        ) RETURNING id INTO v_invoice_id;

        -- Add invoice line item
        INSERT INTO invoice_line_items (
          invoice_id,
          description,
          quantity,
          unit_price,
          amount,
          taxable
        ) VALUES (
          v_invoice_id,
          'Deposit for Proposal ' || NEW.proposal_number,
          1,
          v_deposit_amount,
          v_deposit_amount,
          false
        );

        NEW.deposit_invoice_id := v_invoice_id;
      END IF;
    END IF;

    -- ========================================================================
    -- Create Sales Order (ALL scenarios)
    -- ========================================================================

    INSERT INTO sales_orders (
      company_id,
      proposal_id,
      contact_id,
      order_number,
      status,
      contract_total,
      payment_terms,
      notes,
      created_by
    ) VALUES (
      NEW.company_id,
      NEW.id,
      NEW.contact_id,
      v_order_number,
      v_sales_order_status,
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

    -- Link sales order to proposal
    NEW.sales_order_id := v_sales_order_id;

    -- Update invoice with sales_order_id if created
    IF v_invoice_id IS NOT NULL THEN
      UPDATE invoices
      SET sales_order_id = v_sales_order_id
      WHERE id = v_invoice_id;
    END IF;

    -- Mark billing action as taken
    NEW.billing_action_taken := true;
    NEW.billing_action_at := now();
    NEW.billing_action_by := NEW.approved_by;

    -- ========================================================================
    -- Create Notification for Sales Rep
    -- ========================================================================

    -- Only notify if approved by someone OTHER than the creator (customer approval)
    IF NEW.approved_by IS DISTINCT FROM NEW.created_by THEN
      BEGIN
        INSERT INTO notifications (
          user_id,
          type,
          title,
          message,
          related_id
        ) VALUES (
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
      EXCEPTION
        WHEN OTHERS THEN
          -- Log but don't fail
          RAISE WARNING 'Failed to create notification: %', SQLERRM;
      END;
    END IF;

  END IF;

  RETURN NEW;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION handle_unified_proposal_approval TO authenticated;

-- Add helpful comment
COMMENT ON FUNCTION handle_unified_proposal_approval IS
'Unified approval handler for both manual and portal approvals. Automatically creates sales orders and invoices (with required tax fields) based on proposal settings. No distinction between approval types - all follow same workflow.';
