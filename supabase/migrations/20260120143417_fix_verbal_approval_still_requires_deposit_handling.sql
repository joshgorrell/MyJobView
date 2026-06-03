/*
  # Fix Verbal Approval Deposit Requirement

  1. Issue
    - Verbal approvals were bypassing deposit requirement checks
    - Should still require either deposit_paid or deposit_request_sent when deposit is required

  2. Changes
    - Update validation to ensure verbal approvals respect deposit requirements
    - Verbal method can be used WITH deposit handling (paid or request sent)
    - Only bypass deposit if require_deposit is false
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

  -- No deposit required: any acceptance method is valid
  IF NOT v_require_deposit THEN
    RETURN true;
  END IF;

  -- Deposit IS required: check that deposit has been handled
  -- Either deposit_paid must be true OR deposit_request_sent must be true
  -- This applies to ALL acceptance methods when deposit is required (payment, verbal, etc.)
  RETURN (v_deposit_paid OR v_deposit_request_sent);
END;
$$;

COMMENT ON FUNCTION check_proposal_acceptance_requirements IS 'Validates proposal acceptance requirements: PO method only when no deposit required; all other methods require deposit_paid OR deposit_request_sent when deposit is required';
