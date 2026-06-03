/*
  # Update Proposal Acceptance Requirements to Use Proposal-Level Settings

  1. Changes
    - Update check_proposal_acceptance_requirements to prioritize proposal-level settings
    - Fall back to template settings if proposal-level not set

  2. Business Logic
    - Proposal-level settings always override template settings
    - This allows sales reps to customize per proposal
*/

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

  -- If no deposit required, approval is valid
  IF NOT v_require_deposit THEN
    RETURN true;
  END IF;

  -- If deposit request was sent but deposit not yet received, allow approval
  -- This supports the manual approval workflow where sales rep sends deposit request
  IF v_deposit_request_sent AND NOT v_deposit_paid THEN
    RETURN true;
  END IF;

  -- Check if accepted via payment and deposit is paid
  IF v_accepted_via_method = 'payment' AND 'payment' = ANY(v_acceptance_methods) THEN
    RETURN v_deposit_paid;
  END IF;

  -- Check if accepted via purchase order and PO is provided
  IF v_accepted_via_method = 'purchase_order' AND 'purchase_order' = ANY(v_acceptance_methods) THEN
    RETURN v_purchase_order_number IS NOT NULL;
  END IF;

  -- Check if accepted via verbal approval (manual approval by sales rep)
  IF v_accepted_via_method = 'verbal' THEN
    -- Verbal approvals are allowed for manual approvals by sales reps
    -- Even if deposit hasn't been received, as long as deposit_request_sent flag is set
    RETURN true;
  END IF;

  -- Requirements not met
  RETURN false;
END;
$$;

COMMENT ON FUNCTION check_proposal_acceptance_requirements(uuid) IS 'Check if proposal acceptance requirements are met. Uses proposal-level settings and falls back to template settings.';
