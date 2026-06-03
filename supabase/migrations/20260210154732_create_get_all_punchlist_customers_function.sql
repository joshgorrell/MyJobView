/*
  # Create Function to Get All Punchlist Customers

  1. New Functions
    - `get_all_punchlist_customers` - Returns all customers with any form of punchlist access
      - VIP Membership (active subscriptions)
      - Test & Tune (from punchlist_access_grants)
      - Promotional (from punchlist_access_grants)

  2. Returns
    - Contact information
    - Access type
    - Days remaining
    - Status
    - Associated data (project, subscription plan)
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
    -- VIP Members (active subscriptions)
    SELECT DISTINCT
      c.id as contact_id,
      c.full_name as contact_name,
      c.email as contact_email,
      c.phone as contact_phone,
      'vip_membership'::text as access_type,
      'active'::text as status,
      NULL::int as days_remaining,
      NULL::text as project_name,
      rp.plan_name as subscription_plan_name,
      NULL::timestamptz as expiration_date,
      s.start_date as granted_date
    FROM contacts c
    INNER JOIN subscriptions s ON s.contact_id = c.id
    INNER JOIN recurring_plans rp ON rp.id = s.plan_id
    WHERE s.status IN ('active', 'trial')
      AND rp.show_on_portal = true
  ),
  grant_access AS (
    -- Test & Tune and Promotional Access
    SELECT
      c.id as contact_id,
      c.full_name as contact_name,
      c.email as contact_email,
      c.phone as contact_phone,
      pag.access_type,
      pag.status,
      CASE
        WHEN pag.status = 'expired' THEN NULL
        WHEN pag.expiration_date IS NULL THEN NULL
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
  -- Return all access, prioritizing VIP, then Promotional, then Test & Tune
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
    CASE a.access_type
      WHEN 'vip_membership' THEN 1
      WHEN 'promotional' THEN 2
      WHEN 'test_and_tune' THEN 3
      ELSE 4
    END,
    a.granted_date DESC;
END;
$$;
