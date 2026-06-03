/*
  # Fix Sales Order Creation - Remove Payment Terms Reference

  1. Issue
    - Trigger trying to access NEW.payment_terms from proposals table
    - proposals table doesn't have payment_terms field
    - payment_terms should come from contacts.default_payment_terms or be null

  2. Changes
    - Remove payment_terms from sales order creation trigger
    - Sales orders will use default payment_terms or leave null
*/

-- Fix the sales order creation trigger to not reference payment_terms from proposals
CREATE OR REPLACE FUNCTION create_sales_order_from_proposal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sales_order_id uuid;
  v_order_number text;
  v_requirements_met boolean;
  v_invoice_id uuid;
  v_should_create_invoice boolean;
  v_invoice_status text;
  v_sales_order_status text;
  v_require_deposit boolean;
  v_contact_payment_terms text;
BEGIN
  -- Only process if status changed to 'approved' and no sales order exists yet
  IF NEW.status = 'approved' AND OLD.status != 'approved' AND NEW.sales_order_id IS NULL THEN

    -- Check if acceptance requirements are met
    v_requirements_met := check_proposal_acceptance_requirements(NEW.id);

    IF NOT v_requirements_met THEN
      RAISE EXCEPTION 'Proposal acceptance requirements not met. Deposit or purchase order required.';
    END IF;

    -- Get require_deposit setting
    SELECT COALESCE(p.require_deposit, ps.require_deposit, true)
    INTO v_require_deposit
    FROM proposals p
    LEFT JOIN proposal_settings ps ON ps.id = p.proposal_settings_id
    WHERE p.id = NEW.id;

    -- Determine if invoice should be created
    v_should_create_invoice := should_create_deposit_invoice(
      NEW.accepted_via_method,
      v_require_deposit,
      COALESCE(NEW.deposit_paid, false),
      COALESCE(NEW.deposit_request_sent, false)
    );

    -- Determine invoice status if we need to create one
    IF v_should_create_invoice THEN
      IF NEW.accepted_via_method = 'payment' OR NEW.deposit_paid THEN
        v_invoice_status := 'paid';
      ELSIF NEW.deposit_request_sent THEN
        v_invoice_status := 'sent';
      ELSE
        v_invoice_status := 'sent';
      END IF;

      -- Create invoice only if needed and doesn't already exist
      IF NEW.deposit_invoice_id IS NULL AND NEW.deposit_amount_due > 0 THEN
        BEGIN
          v_invoice_id := create_deposit_invoice_from_proposal(NEW.id, v_invoice_status);
          NEW.deposit_invoice_id := v_invoice_id;
        EXCEPTION WHEN OTHERS THEN
          -- Log error but don't block approval
          RAISE WARNING 'Failed to create deposit invoice: %', SQLERRM;
        END;
      END IF;
    END IF;

    -- Determine sales order status based on payment state
    IF NEW.accepted_via_method = 'purchase_order' THEN
      -- PO customers: Ready to plan immediately
      v_sales_order_status := 'planning';
    ELSIF NOT v_require_deposit THEN
      -- No deposit required: Ready to plan
      v_sales_order_status := 'planning';
    ELSIF NEW.deposit_paid THEN
      -- Deposit received: Ready to plan
      v_sales_order_status := 'planning';
    ELSIF NEW.deposit_request_sent AND NOT NEW.deposit_paid THEN
      -- Waiting for deposit: Pending
      v_sales_order_status := 'pending_deposit';
    ELSE
      -- Default to planning
      v_sales_order_status := 'planning';
    END IF;

    -- Generate sales order number from proposal number
    v_order_number := generate_sales_order_number(NEW.proposal_number);

    -- Set approval timestamp if not already set
    IF NEW.approval_completed_at IS NULL THEN
      NEW.approval_completed_at := now();
    END IF;

    -- Get payment terms from contact if available
    SELECT default_payment_terms
    INTO v_contact_payment_terms
    FROM contacts
    WHERE id = NEW.contact_id;

    -- Create the sales order with appropriate status
    INSERT INTO sales_orders (
      company_id,
      proposal_id,
      contact_id,
      order_number,
      status,
      contract_total,
      payment_terms,
      notes,
      created_by,
      created_at,
      updated_at
    ) VALUES (
      NEW.company_id,
      NEW.id,
      NEW.contact_id,
      v_order_number,
      v_sales_order_status,
      NEW.total,
      v_contact_payment_terms, -- Use contact's default payment terms
      CASE
        WHEN NEW.accepted_via_method = 'purchase_order' THEN
          'Converted from proposal ' || NEW.proposal_number || ' - PO: ' || NEW.purchase_order_number
        ELSE
          'Converted from proposal ' || NEW.proposal_number
      END,
      NEW.approved_by,
      now(),
      now()
    )
    RETURNING id INTO v_sales_order_id;

    -- Link sales order back to proposal
    NEW.sales_order_id := v_sales_order_id;

    -- Create notification for sales rep (the proposal creator)
    -- Only if approved by someone other than the creator (i.e., customer approval)
    IF NEW.approved_by IS DISTINCT FROM NEW.created_by THEN
      INSERT INTO activity_feed (
        company_id,
        user_id,
        activity_type,
        entity_type,
        entity_id,
        title,
        description,
        created_at
      ) VALUES (
        NEW.company_id,
        NEW.created_by,
        'proposal_approved',
        'proposal',
        NEW.id,
        'Proposal Approved by Customer',
        'Proposal ' || NEW.proposal_number || ' has been approved and converted to Sales Order ' || v_order_number ||
        CASE
          WHEN NEW.accepted_via_method = 'purchase_order' THEN ' (via Purchase Order)'
          WHEN NEW.deposit_paid THEN ' (deposit received)'
          WHEN NEW.deposit_request_sent THEN ' (deposit requested)'
          ELSE ''
        END,
        now()
      );
    END IF;

  END IF;

  RETURN NEW;
END;
$$;

-- Add comment
COMMENT ON FUNCTION create_sales_order_from_proposal() IS 'Smart sales order creation: PO approvals skip invoicing, payment approvals create paid invoices, verbal approvals respect deposit settings. Uses contact default_payment_terms for sales order.';
