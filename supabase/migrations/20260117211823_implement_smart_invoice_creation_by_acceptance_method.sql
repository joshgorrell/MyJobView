/*
  # Smart Invoice Creation Based on Acceptance Method

  1. Key Business Rules
    - Purchase Order approvals: NO invoice created at approval time (PO customers get net payment terms)
    - Payment approvals: Invoice created as "paid" immediately
    - Verbal approvals with deposit received: Invoice created as "paid"
    - Verbal approvals with deposit request: Invoice created as "sent"
    - Verbal approvals without deposit required: NO invoice created

  2. Changes
    - Update create_deposit_invoice_from_proposal to support different invoice statuses
    - Update create_sales_order_from_proposal trigger with smart invoice logic
    - Add helper function to determine if invoice should be created
    - Handle payment record creation for paid invoices
    - Update sales order status based on payment state

  3. Invoice Creation Matrix
    - accepted_via_method = 'purchase_order' → NO invoice
    - accepted_via_method = 'payment' → Invoice status 'paid'
    - accepted_via_method = 'verbal' + deposit_paid = true → Invoice status 'paid'
    - accepted_via_method = 'verbal' + deposit_request_sent = true → Invoice status 'sent'
    - accepted_via_method = 'verbal' + require_deposit = false → NO invoice

  4. Sales Order Status Logic
    - PO approvals → status 'planning' (no deposit needed)
    - Payment received → status 'planning' (ready to schedule)
    - Deposit request sent → status 'pending_deposit' (awaiting payment)
    - No deposit required → status 'planning' (ready to proceed)
*/

-- Function to determine if invoice should be created based on acceptance method
CREATE OR REPLACE FUNCTION should_create_deposit_invoice(
  p_accepted_via_method text,
  p_require_deposit boolean,
  p_deposit_paid boolean,
  p_deposit_request_sent boolean
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- Purchase Order: Never create invoice at approval
  IF p_accepted_via_method = 'purchase_order' THEN
    RETURN false;
  END IF;

  -- No deposit required: No invoice needed
  IF NOT p_require_deposit THEN
    RETURN false;
  END IF;

  -- Payment method: Always create invoice (marked as paid)
  IF p_accepted_via_method = 'payment' THEN
    RETURN true;
  END IF;

  -- Verbal with deposit received: Create invoice (marked as paid)
  IF p_accepted_via_method = 'verbal' AND p_deposit_paid THEN
    RETURN true;
  END IF;

  -- Verbal with deposit request sent: Create invoice (marked as sent)
  IF p_accepted_via_method = 'verbal' AND p_deposit_request_sent THEN
    RETURN true;
  END IF;

  -- Default: No invoice
  RETURN false;
END;
$$;

-- Enhanced function to create deposit invoice with status parameter
CREATE OR REPLACE FUNCTION create_deposit_invoice_from_proposal(
  p_proposal_id uuid,
  p_invoice_status text DEFAULT 'sent'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_invoice_id uuid;
  v_invoice_number text;
  v_proposal record;
  v_deposit_amount numeric(10,2);
  v_deposit_description text;
  v_payment_id uuid;
BEGIN
  -- Get proposal details
  SELECT
    p.id,
    p.company_id,
    p.contact_id,
    p.proposal_number,
    p.deposit_amount_due,
    p.created_by,
    p.deposit_payment_date,
    p.tax_rate,
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

  -- Generate invoice number
  v_invoice_number := generate_invoice_number();

  -- Create description
  v_deposit_description := 'Deposit for Proposal ' || v_proposal.proposal_number;

  -- Calculate amounts (deposit already includes tax if applicable)
  -- Create invoice
  INSERT INTO invoices (
    company_id,
    proposal_id,
    contact_id,
    invoice_number,
    invoice_type,
    invoice_date,
    due_date,
    subtotal,
    tax_amount,
    tax_rate,
    total,
    amount_due,
    status,
    payment_terms,
    notes,
    created_by,
    created_at,
    updated_at
  ) VALUES (
    v_proposal.company_id,
    v_proposal.id,
    v_proposal.contact_id,
    v_invoice_number,
    'deposit',
    CURRENT_DATE,
    CURRENT_DATE,
    v_deposit_amount,
    0,
    COALESCE(v_proposal.tax_rate, 0),
    v_deposit_amount,
    CASE WHEN p_invoice_status = 'paid' THEN 0 ELSE v_deposit_amount END,
    p_invoice_status,
    CASE
      WHEN p_invoice_status = 'paid' THEN 'Paid'
      ELSE 'Due upon receipt'
    END,
    CASE
      WHEN p_invoice_status = 'paid' THEN 'Deposit payment received for ' || v_proposal.contact_name
      ELSE 'Deposit invoice for ' || v_proposal.contact_name
    END,
    v_proposal.created_by,
    now(),
    now()
  )
  RETURNING id INTO v_invoice_id;

  -- Add line item
  INSERT INTO invoice_line_items (
    invoice_id,
    description,
    quantity,
    unit_price,
    amount,
    sort_order,
    taxable
  ) VALUES (
    v_invoice_id,
    v_deposit_description,
    1,
    v_deposit_amount,
    v_deposit_amount,
    1,
    false
  );

  -- If invoice status is 'paid', create payment record
  IF p_invoice_status = 'paid' THEN
    INSERT INTO invoice_payments (
      company_id,
      invoice_id,
      proposal_id,
      payment_date,
      amount,
      payment_method,
      reference_number,
      notes,
      created_by,
      created_at
    ) VALUES (
      v_proposal.company_id,
      v_invoice_id,
      v_proposal.id,
      COALESCE(v_proposal.deposit_payment_date, CURRENT_DATE),
      v_deposit_amount,
      'other',
      'Deposit - Proposal ' || v_proposal.proposal_number,
      'Deposit payment recorded at proposal approval',
      v_proposal.created_by,
      now()
    )
    RETURNING id INTO v_payment_id;
  END IF;

  -- Update proposal with invoice reference
  UPDATE proposals
  SET deposit_invoice_id = v_invoice_id
  WHERE id = p_proposal_id;

  RETURN v_invoice_id;
END;
$$;

-- Update check_proposal_acceptance_requirements to allow PO without deposit
CREATE OR REPLACE FUNCTION check_proposal_acceptance_requirements(p_proposal_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_require_deposit boolean;
  v_deposit_paid boolean;
  v_acceptance_methods text[];
  v_purchase_order_number text;
  v_accepted_via_method text;
  v_deposit_request_sent boolean;
BEGIN
  -- Get proposal details, prioritizing proposal-level settings over template settings
  SELECT
    COALESCE(p.require_deposit, ps.require_deposit, true),
    COALESCE(p.deposit_paid, false),
    COALESCE(p.acceptance_methods, ps.acceptance_methods, ARRAY['payment']::text[]),
    p.purchase_order_number,
    p.accepted_via_method,
    COALESCE(p.deposit_request_sent, false)
  INTO
    v_require_deposit,
    v_deposit_paid,
    v_acceptance_methods,
    v_purchase_order_number,
    v_accepted_via_method,
    v_deposit_request_sent
  FROM proposals p
  LEFT JOIN proposal_settings ps ON ps.id = p.proposal_settings_id
  WHERE p.id = p_proposal_id;

  -- Purchase Order: Only requires PO number, deposit NOT needed
  IF v_accepted_via_method = 'purchase_order' AND 'purchase_order' = ANY(v_acceptance_methods) THEN
    RETURN v_purchase_order_number IS NOT NULL;
  END IF;

  -- No deposit required: approval is valid
  IF NOT v_require_deposit THEN
    RETURN true;
  END IF;

  -- If deposit request was sent, allow approval regardless of payment status
  -- This supports the manual approval workflow where sales rep sends deposit request
  IF v_deposit_request_sent THEN
    RETURN true;
  END IF;

  -- Check if accepted via payment and deposit is paid
  IF v_accepted_via_method = 'payment' AND 'payment' = ANY(v_acceptance_methods) THEN
    RETURN v_deposit_paid;
  END IF;

  -- Check if accepted via verbal approval (manual approval by sales rep)
  IF v_accepted_via_method = 'verbal' THEN
    -- Verbal approvals are allowed for manual approvals by sales reps
    RETURN true;
  END IF;

  -- Requirements not met
  RETURN false;
END;
$$;

-- Main trigger function with smart invoice creation logic
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
      NEW.payment_terms,
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

-- Recreate trigger
DROP TRIGGER IF EXISTS trigger_create_sales_order_from_proposal ON proposals;

CREATE TRIGGER trigger_create_sales_order_from_proposal
  BEFORE UPDATE ON proposals
  FOR EACH ROW
  EXECUTE FUNCTION create_sales_order_from_proposal();

-- Grant permissions
GRANT EXECUTE ON FUNCTION should_create_deposit_invoice(text, boolean, boolean, boolean) TO authenticated;

-- Add helpful comments
COMMENT ON FUNCTION should_create_deposit_invoice IS 'Determines if deposit invoice should be created based on acceptance method and deposit status';
COMMENT ON FUNCTION create_deposit_invoice_from_proposal(uuid, text) IS 'Creates deposit invoice with specified status (paid/sent). Purchase Order approvals skip invoice creation entirely.';
COMMENT ON FUNCTION create_sales_order_from_proposal() IS 'Smart sales order creation: PO approvals skip invoicing, payment approvals create paid invoices, verbal approvals respect deposit settings';
