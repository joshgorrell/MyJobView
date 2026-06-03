/*
  # Update get_upcoming_punchlist_customers with hours aggregation

  ## Summary
  Replaces the existing RPC with a new version that:
  1. Aggregates actual/estimated hours from work_orders per project
  2. Only returns projects that are >= 80% complete by hours, OR have zero estimated hours
     (some sales orders don't involve labor, and those should still appear)
  3. Adds three new return columns: total_actual_hours, total_estimated_hours, progress_percent

  ## Changes
  - DROP and recreate get_upcoming_punchlist_customers()
  - New return columns: total_actual_hours (numeric), total_estimated_hours (numeric), progress_percent (numeric)
  - New filter: SUM(estimated_hours) = 0 OR SUM(actual_hours) / SUM(estimated_hours) >= 0.80
  - LEFT JOIN to work_orders aggregated per project_id

  ## Notes
  - Projects with no work orders (no labor) are treated as 0/0 = pass-through (show in list)
  - NULLIF prevents division-by-zero
  - Security: SECURITY DEFINER, authenticated only, same organization check preserved
*/

DROP FUNCTION IF EXISTS get_upcoming_punchlist_customers();

CREATE OR REPLACE FUNCTION get_upcoming_punchlist_customers()
RETURNS TABLE (
  contact_id             uuid,
  contact_name           text,
  contact_email          text,
  contact_phone          text,
  project_id             uuid,
  project_name           text,
  project_number         text,
  project_status         text,
  target_completion_date date,
  days_until_completion  int,
  assigned_pm_name       text,
  sales_order_id         uuid,
  sales_order_number     text,
  total_actual_hours     numeric,
  total_estimated_hours  numeric,
  progress_percent       numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM profiles
  WHERE id = auth.uid()
  LIMIT 1;

  RETURN QUERY
  WITH work_order_hours AS (
    SELECT
      wo.project_id,
      COALESCE(SUM(wo.actual_hours), 0)    AS actual_hrs,
      COALESCE(SUM(wo.estimated_hours), 0) AS estimated_hrs
    FROM work_orders wo
    WHERE wo.project_id IS NOT NULL
    GROUP BY wo.project_id
  )
  SELECT
    c.id                                                          AS contact_id,
    c.full_name                                                   AS contact_name,
    c.email                                                       AS contact_email,
    c.phone                                                       AS contact_phone,
    p.id                                                          AS project_id,
    p.name                                                        AS project_name,
    p.project_number                                              AS project_number,
    p.status                                                      AS project_status,
    p.target_completion_date                                      AS target_completion_date,
    CASE
      WHEN p.target_completion_date IS NULL THEN NULL
      ELSE (p.target_completion_date - CURRENT_DATE)::int
    END                                                           AS days_until_completion,
    pm.full_name                                                  AS assigned_pm_name,
    so.id                                                         AS sales_order_id,
    so.order_number                                               AS sales_order_number,
    COALESCE(woh.actual_hrs, 0)                                   AS total_actual_hours,
    COALESCE(woh.estimated_hrs, 0)                                AS total_estimated_hours,
    CASE
      WHEN COALESCE(woh.estimated_hrs, 0) = 0 THEN NULL
      ELSE ROUND((COALESCE(woh.actual_hrs, 0) / woh.estimated_hrs) * 100, 1)
    END                                                           AS progress_percent
  FROM projects p
  JOIN contacts c ON c.id = p.contact_id
  LEFT JOIN profiles pm ON pm.id = p.assigned_pm
  LEFT JOIN sales_orders so ON so.id = p.sales_order_id
  LEFT JOIN work_order_hours woh ON woh.project_id = p.id
  WHERE
    -- Only in-progress projects
    p.status IN ('planning', 'active')
    -- Not yet substantially complete
    AND p.substantial_completion_date IS NULL
    -- 80% hours threshold: pass if no estimated hours OR >= 80% actual
    AND (
      COALESCE(woh.estimated_hrs, 0) = 0
      OR COALESCE(woh.actual_hrs, 0) / NULLIF(woh.estimated_hrs, 0) >= 0.80
    )
    -- No active or suspended access grant already exists for this contact
    AND NOT EXISTS (
      SELECT 1 FROM punchlist_access_grants ag
      WHERE ag.contact_id = p.contact_id
        AND ag.status IN ('active', 'suspended')
    )
    -- No pending invite already queued for this contact
    AND NOT EXISTS (
      SELECT 1 FROM pending_punchlist_invites pi
      WHERE pi.contact_id = p.contact_id
        AND pi.status = 'pending'
    )
    -- Multi-tenant safety
    AND c.organization_id = v_org_id
  ORDER BY
    CASE WHEN p.target_completion_date IS NULL THEN 1 ELSE 0 END,
    p.target_completion_date ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_upcoming_punchlist_customers() TO authenticated;
