/*
  # Fix get_contact_portal_access_level for Promotional Access

  1. Changes
    - Fix the function to check for 'promotional' access type instead of 'direct'
    - Ensure all three access methods are properly checked:
      * VIP Membership (active or trial subscription)
      * Test & Tune (90-day program)
      * Promotional (direct invite from staff)
    
  2. Access Priority
    - VIP membership grants 'full_portal' access (highest priority)
    - Promotional access grants 'full_portal' access
    - Test & Tune access grants 'full_portal' access
    - Active proposal grants 'proposal_only' access (lowest priority)
    - No qualifying conditions returns 'no_access'
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
  v_has_promotional boolean := false;
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
  
  -- Check for promotional punchlist access grant
  SELECT EXISTS (
    SELECT 1 FROM punchlist_access_grants
    WHERE contact_id = p_contact_id
    AND access_type = 'promotional'
    AND status = 'active'
    AND (expiration_date IS NULL OR expiration_date >= CURRENT_DATE)
    LIMIT 1
  ) INTO v_has_promotional;
  
  IF v_has_promotional THEN
    RETURN 'full_portal';
  END IF;
  
  -- Check for active Test & Tune access
  SELECT EXISTS (
    SELECT 1 FROM punchlist_access_grants
    WHERE contact_id = p_contact_id
    AND access_type = 'test_and_tune'
    AND status = 'active'
    AND (expiration_date IS NULL OR expiration_date >= CURRENT_DATE)
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
