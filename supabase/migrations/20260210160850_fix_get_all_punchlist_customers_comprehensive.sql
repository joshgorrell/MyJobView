/*
  # Fix Get All Punchlist Customers Function

  1. Changes
    - Include ALL customers with any punchlist access (active, expired, pending)
    - Calculate status dynamically based on expiration dates
    - Include customers with access grants regardless of stored status
    - Show all access types properly

  2. Returns
    - All customers with VIP, Test & Tune, or Promotional access
    - Proper status calculation
    - Access type indicators
*/

CREATE OR REPLACE FUNCTION get_all_punchlist_customers()
RETURNS TABLE (
  contact_id uuid,
  contact_name text,
  contact_email text,
  contact_phone text,
  access_type text,
  status text,
  days_remaining int,
  project_name text,
  subscription_plan_name text,
  expiration_date timestamptz,
  granted_date timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH vip_access AS (
    -- VIP Members (active and trial subscriptions)
    SELECT DISTINCT
      c.id as contact_id,
      c.full_name as contact_name,
      c.email as contact_email,
      c.phone as contact_phone,
      'vip_membership'::text as access_type,
      s.status::text as status,
      NULL::int as days_remaining,
      NULL::text as project_name,
      rp.plan_name as subscription_plan_name,
      NULL::timestamptz as expiration_date,
      s.start_date as granted_date
    FROM contacts c
    INNER JOIN subscriptions s ON s.contact_id = c.id
    INNER JOIN recurring_plans rp ON rp.id = s.plan_id
    WHERE s.status IN ('active', 'trial')
  ),
  grant_access AS (
    -- Test & Tune and Promotional Access (all statuses)
    SELECT
      c.id as contact_id,
      c.full_name as contact_name,
      c.email as contact_email,
      c.phone as contact_phone,
      pag.access_type,
      -- Calculate status dynamically based on expiration
      CASE
        WHEN pag.expiration_date IS NULL THEN 'active'
        WHEN pag.expiration_date > NOW() THEN 'active'
        ELSE 'expired'
      END::text as status,
      -- Calculate days remaining
      CASE
        WHEN pag.expiration_date IS NULL THEN NULL
        WHEN pag.expiration_date <= NOW() THEN 0
        ELSE GREATEST(0, CEIL(EXTRACT(EPOCH FROM (pag.expiration_date - NOW())) / 86400))::int
      END as days_remaining,
      p.name as project_name,
      NULL::text as subscription_plan_name,
      pag.expiration_date,
      pag.granted_date
    FROM contacts c
    INNER JOIN punchlist_access_grants pag ON pag.contact_id = c.id
    LEFT JOIN projects p ON p.id = pag.project_id
    WHERE pag.access_type IN ('test_and_tune', 'promotional')
  ),
  all_access AS (
    SELECT * FROM vip_access
    UNION ALL
    SELECT * FROM grant_access
  )
  -- Return all access, prioritizing VIP, then active access, then most recent
  SELECT DISTINCT ON (a.contact_id)
    a.contact_id,
    a.contact_name,
    a.contact_email,
    a.contact_phone,
    a.access_type,
    a.status,
    a.days_remaining,
    a.project_name,
    a.subscription_plan_name,
    a.expiration_date,
    a.granted_date
  FROM all_access a
  ORDER BY
    a.contact_id,
    -- Prioritize VIP members first
    CASE a.access_type
      WHEN 'vip_membership' THEN 1
      WHEN 'test_and_tune' THEN 2
      WHEN 'promotional' THEN 3
      ELSE 4
    END,
    -- Then prioritize active over expired
    CASE a.status
      WHEN 'active' THEN 1
      WHEN 'trial' THEN 1
      WHEN 'expired' THEN 2
      ELSE 3
    END,
    -- Finally, most recent first
    a.granted_date DESC NULLS LAST;
END;
$$;
