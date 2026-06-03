/*
  # Fix get_contact_portal_access_level Function

  1. Changes
    - Fix the function to properly check for VIP access by joining with recurring_plans
    - Use plan_type = 'vip' instead of punchlist_enabled column which doesn't exist on recurring_subscriptions
*/

CREATE OR REPLACE FUNCTION public.get_contact_portal_access_level(p_contact_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_access_level text := 'no_access';
  v_has_vip boolean := false;
  v_has_test_tune boolean := false;
  v_has_active_proposal boolean := false;
BEGIN
  -- Check for active VIP subscription (active or trial)
  SELECT EXISTS (
    SELECT 1 
    FROM recurring_subscriptions rs
    JOIN recurring_plans rp ON rs.plan_id = rp.id
    WHERE rs.contact_id = p_contact_id
    AND rs.status IN ('active', 'trial')
    AND rp.plan_type = 'vip'
    LIMIT 1
  ) INTO v_has_vip;
  
  IF v_has_vip THEN
    RETURN 'full_portal';
  END IF;
  
  -- Check for active Test & Tune access
  SELECT EXISTS (
    SELECT 1 FROM punchlist_access_grants
    WHERE contact_id = p_contact_id
    AND access_type = 'test_and_tune'
    AND status = 'active'
    LIMIT 1
  ) INTO v_has_test_tune;
  
  IF v_has_test_tune THEN
    RETURN 'full_portal';
  END IF;
  
  -- Check for direct punchlist access grant
  SELECT EXISTS (
    SELECT 1 FROM punchlist_access_grants
    WHERE contact_id = p_contact_id
    AND access_type = 'direct'
    AND status = 'active'
    LIMIT 1
  ) INTO v_has_test_tune;
  
  IF v_has_test_tune THEN
    RETURN 'full_portal';
  END IF;
  
  -- Check for active proposal that grants portal access
  SELECT EXISTS (
    SELECT 1 FROM proposals
    WHERE contact_id = p_contact_id
    AND status IN ('sent', 'viewed', 'approved', 'approved_pending_action')
    LIMIT 1
  ) INTO v_has_active_proposal;
  
  IF v_has_active_proposal THEN
    RETURN 'proposal_only';
  END IF;
  
  RETURN 'no_access';
END;
$$;
