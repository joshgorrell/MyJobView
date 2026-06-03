/*
  # Add get_upcoming_punchlist_customers RPC

  ## Summary
  Creates a new RPC function that returns all active/planning projects whose
  contacts do NOT yet have an active Test & Tune access grant or a pending invite.
  This powers the "Upcoming" section in the Punchlist Customers view, giving staff
  visibility into which customers are approaching their T&T eligibility window.

  ## New Functions
  - `get_upcoming_punchlist_customers()` — returns projects in 'planning' or 'active'
    status joined with contact, sales order, and assigned PM info, excluding contacts
    that already have active punchlist access or a pending invite queued.

  ## Returns
  - contact_id, contact_name, contact_email, contact_phone
  - project_id, project_name, project_number, project_status
  - target_completion_date, days_until_completion (computed)
  - assigned_pm_name
  - sales_order_id, sales_order_number

  ## Security
  - SECURITY DEFINER with explicit search_path
  - Accessible to authenticated users only
*/

CREATE OR REPLACE FUNCTION get_upcoming_punchlist_customers()
RETURNS TABLE (
  contact_id          uuid,
  contact_name        text,
  contact_email       text,
  contact_phone       text,
  project_id          uuid,
  project_name        text,
  project_number      text,
  project_status      text,
  target_completion_date date,
  days_until_completion  int,
  assigned_pm_name    text,
  sales_order_id      uuid,
  sales_order_number  text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
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
    so.order_number                                               AS sales_order_number
  FROM projects p
  JOIN contacts c ON c.id = p.contact_id
  LEFT JOIN profiles pm ON pm.id = p.assigned_pm
  LEFT JOIN sales_orders so ON so.id = p.sales_order_id
  WHERE
    -- Only in-progress projects
    p.status IN ('planning', 'active')
    -- Not yet substantially complete
    AND p.substantial_completion_date IS NULL
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
    -- Must be in same organization (multi-tenant safety via contacts)
    AND c.organization_id = (
      SELECT organization_id FROM profiles
      WHERE id = auth.uid()
      LIMIT 1
    )
  ORDER BY
    -- Overdue / soonest first; NULLs last
    CASE WHEN p.target_completion_date IS NULL THEN 1 ELSE 0 END,
    p.target_completion_date ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_upcoming_punchlist_customers() TO authenticated;
