/*
  # Update Verbal Approval Flow for Deposit Invoices

  1. Changes
    - Verbal approval with deposit required: Always creates deposit invoice
    - Invoice appears on customer portal immediately (status: 'sent')
    - Sales order created with 'pending_deposit' status
    - Customer can pay online OR staff can apply payment manually
    - When invoice is paid, sales order moves to 'planning'

  2. Validation Updates
    - Verbal approval: Allowed when deposit_request_sent OR deposit_paid
    - Payment method: deposit_paid must be true
    - PO method: Only allowed when no deposit required
*/

-- Update the acceptance requirements validation
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

  -- Purchase Order: Only allowed when deposit is NOT required
  IF v_accepted_via_method = 'purchase_order' THEN
    -- Check if PO is in allowed methods
    IF NOT ('purchase_order' = ANY(v_acceptance_methods)) THEN
      RETURN false;
    END IF;
    
    -- Check if deposit is required - PO not allowed with deposits
    IF v_require_deposit THEN
      RETURN false;
    END IF;
    
    -- Check if PO number is provided
    RETURN v_purchase_order_number IS NOT NULL;
  END IF;

  -- Payment Received method: Deposit must be marked as paid
  IF v_accepted_via_method = 'payment' THEN
    RETURN v_deposit_paid;
  END IF;

  -- Verbal/In-Person approval: If deposit required, must have deposit_request_sent OR deposit_paid
  -- This allows the flow where we create the invoice and let customer pay OR manually apply payment
  IF v_accepted_via_method = 'verbal' THEN
    IF v_require_deposit THEN
      RETURN (v_deposit_request_sent OR v_deposit_paid);
    END IF;
    -- No deposit required, approval is valid
    RETURN true;
  END IF;

  -- No deposit required: any acceptance method is valid
  IF NOT v_require_deposit THEN
    RETURN true;
  END IF;

  -- Default: require deposit to be handled
  RETURN (v_deposit_paid OR v_deposit_request_sent);
END;
$$;

COMMENT ON FUNCTION check_proposal_acceptance_requirements IS 'Validates proposal acceptance requirements: PO only when no deposit; Payment requires deposit_paid; Verbal requires deposit_request_sent OR deposit_paid when deposit required';
