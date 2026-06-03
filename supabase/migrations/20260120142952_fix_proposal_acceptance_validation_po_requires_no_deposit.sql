/*
  # Fix Proposal Acceptance Validation - PO Requires No Deposit

  1. Issue
    - Purchase Order acceptance method should only be available when deposit is NOT required
    - Current validation allows PO even when deposit is required

  2. Changes
    - Update check_proposal_acceptance_requirements to reject PO when deposit is required
    - Ensure PO can only be used with no deposit requirement
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

COMMENT ON FUNCTION check_proposal_acceptance_requirements IS 'Validates proposal acceptance requirements: PO method only allowed when no deposit required, payment method requires deposit confirmation, verbal approvals allowed for manual processing';
