/*
  # Update get_punchlist_access_info for Promotional Access

  1. Changes
    - Update get_punchlist_access_info to properly handle 'promotional' access type
    - Update priority ordering to: vip_membership > promotional > test_and_tune
    - Ensures promotional access is displayed correctly in UI
    
  2. Priority Explanation
    - VIP membership = highest priority (paid subscription)
    - Promotional = second priority (marketing/sales invite)
    - Test & Tune = third priority (project completion invite)
*/

CREATE OR REPLACE FUNCTION get_punchlist_access_info(p_contact_id uuid)
RETURNS TABLE (
  has_access boolean,
  access_type text,
  days_remaining integer,
  expiration_date date,
  subscription_plan_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- First check if they have a VIP subscription (including trial period)
  RETURN QUERY
  SELECT
    true as has_access,
    CASE
      WHEN rs.trial_end_date >= CURRENT_DATE THEN 'test_and_tune'
      ELSE 'vip_membership'
    END as access_type,
    CASE
      WHEN rs.trial_end_date >= CURRENT_DATE THEN (rs.trial_end_date - CURRENT_DATE)::integer
      ELSE NULL
    END as days_remaining,
    CASE
      WHEN rs.trial_end_date >= CURRENT_DATE THEN rs.trial_end_date
      ELSE NULL
    END as expiration_date,
    rp.plan_name as subscription_plan_name
  FROM recurring_subscriptions rs
  INNER JOIN recurring_plans rp ON rp.id = rs.plan_id
  WHERE rs.contact_id = p_contact_id
  AND rs.status = 'active'
  AND (
    rs.trial_end_date >= CURRENT_DATE  -- Active trial period
    OR rs.next_billing_date >= CURRENT_DATE  -- Active paid subscription
  )
  LIMIT 1;

  -- If no VIP access found, check manual punchlist grants
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT
      true as has_access,
      pag.access_type,
      CASE
        WHEN pag.expiration_date IS NULL THEN NULL
        ELSE (pag.expiration_date - CURRENT_DATE)::integer
      END as days_remaining,
      pag.expiration_date,
      rp.plan_name as subscription_plan_name
    FROM punchlist_access_grants pag
    LEFT JOIN recurring_subscriptions rs ON rs.id = pag.subscription_id
    LEFT JOIN recurring_plans rp ON rp.id = rs.plan_id
    WHERE pag.contact_id = p_contact_id
    AND pag.status = 'active'
    AND (pag.expiration_date IS NULL OR pag.expiration_date >= CURRENT_DATE)
    ORDER BY
      CASE pag.access_type
        WHEN 'vip_membership' THEN 1
        WHEN 'promotional' THEN 2
        WHEN 'test_and_tune' THEN 3
      END
    LIMIT 1;
  END IF;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_punchlist_access_info TO authenticated;
GRANT EXECUTE ON FUNCTION get_punchlist_access_info TO anon;
