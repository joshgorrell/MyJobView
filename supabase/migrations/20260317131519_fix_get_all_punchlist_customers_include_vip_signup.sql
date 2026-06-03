/*
  # Include vip_signup access type in get_all_punchlist_customers

  ## Problem
  When a "VIP Signup" punchlist invite is sent, the access_type stored in
  punchlist_access_grants is 'vip_signup'. The get_all_punchlist_customers()
  function only queried for 'test_and_tune' and 'promotional' access types in
  the grant_access CTE, so vip_signup contacts were silently omitted from the
  Customers list.

  ## Changes
  - Add 'vip_signup' to the WHERE clause of the grant_access CTE
  - Add 'vip_signup' to the CASE ordering so it sorts correctly (after vip_membership)
*/

DROP FUNCTION IF EXISTS get_all_punchlist_customers();

CREATE FUNCTION get_all_punchlist_customers()
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
  granted_date timestamptz,
  grant_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH vip_access AS (
    SELECT DISTINCT
      c.id                           AS contact_id,
      c.full_name                    AS contact_name,
      c.email                        AS contact_email,
      c.phone                        AS contact_phone,
      'vip_membership'::text         AS access_type,
      s.status::text                 AS status,
      NULL::int                      AS days_remaining,
      NULL::text                     AS project_name,
      rp.plan_name                   AS subscription_plan_name,
      NULL::timestamptz              AS expiration_date,
      s.start_date::timestamptz      AS granted_date,
      NULL::uuid                     AS grant_id
    FROM contacts c
    INNER JOIN recurring_subscriptions s ON s.contact_id = c.id
    INNER JOIN recurring_plans rp        ON rp.id = s.plan_id
    WHERE s.status IN ('active', 'trial')
  ),
  grant_access AS (
    SELECT
      c.id                       AS contact_id,
      c.full_name                AS contact_name,
      c.email                    AS contact_email,
      c.phone                    AS contact_phone,
      pag.access_type,
      CASE
        WHEN pag.status = 'suspended' THEN 'suspended'
        WHEN pag.expiration_date IS NULL THEN 'active'
        WHEN pag.expiration_date > NOW() THEN 'active'
        ELSE 'expired'
      END::text                  AS status,
      CASE
        WHEN pag.expiration_date IS NULL THEN NULL
        WHEN pag.expiration_date <= NOW() THEN 0
        ELSE GREATEST(0, CEIL(EXTRACT(EPOCH FROM (pag.expiration_date - NOW())) / 86400))::int
      END                        AS days_remaining,
      p.name                     AS project_name,
      NULL::text                 AS subscription_plan_name,
      pag.expiration_date,
      pag.granted_date,
      pag.id                     AS grant_id
    FROM contacts c
    INNER JOIN punchlist_access_grants pag ON pag.contact_id = c.id
    LEFT  JOIN projects p ON p.id = pag.project_id
    WHERE pag.access_type IN ('test_and_tune', 'promotional', 'vip_signup')
  ),
  all_access AS (
    SELECT * FROM vip_access
    UNION ALL
    SELECT * FROM grant_access
  )
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
    a.granted_date,
    a.grant_id
  FROM all_access a
  ORDER BY
    a.contact_id,
    CASE a.access_type
      WHEN 'vip_membership' THEN 1
      WHEN 'vip_signup'     THEN 2
      WHEN 'test_and_tune'  THEN 3
      WHEN 'promotional'    THEN 4
      ELSE 5
    END,
    CASE a.status
      WHEN 'active'     THEN 1
      WHEN 'trial'      THEN 1
      WHEN 'suspended'  THEN 2
      WHEN 'expired'    THEN 3
      ELSE 4
    END,
    a.granted_date DESC NULLS LAST;
END;
$$;
