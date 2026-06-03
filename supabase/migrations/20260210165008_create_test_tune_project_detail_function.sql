/*
  # Create Test & Tune Project Detail Function

  ## Summary
  Creates a function to retrieve comprehensive details for a single test & tune project
  including work orders, punchlist items, and performance metrics.

  ## Functions
  - get_test_tune_project_detail: Returns detailed information for one project
  - get_test_tune_project_work_orders: Returns work orders for a test & tune project
*/

-- Function to get detailed information for a single test & tune project
CREATE OR REPLACE FUNCTION get_test_tune_project_detail(project_sales_order_id uuid)
RETURNS TABLE (
  id uuid,
  order_number text,
  contact_name text,
  contact_id uuid,
  contact_email text,
  contact_phone text,
  project_id uuid,
  project_title text,
  office_name text,
  office_id uuid,
  lead_tech_name text,
  lead_tech_id uuid,
  pm_name text,
  pm_id uuid,
  sales_rep_name text,
  sales_rep_id uuid,
  test_tune_start_date date,
  test_tune_end_date date,
  total_estimated_labor numeric,
  field_labor_target numeric,
  field_hours_used numeric,
  pm_hours_used numeric,
  non_performance_hours numeric,
  has_vip_membership boolean,
  portal_access_level text,
  punchlist_item_count integer,
  work_order_count integer,
  contract_total numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    so.id,
    so.order_number,
    c.full_name as contact_name,
    so.contact_id,
    c.email as contact_email,
    c.phone as contact_phone,
    p.id as project_id,
    p.title as project_title,
    COALESCE(co.office_name, 'No Office') as office_name,
    so.office_id,
    lt.full_name as lead_tech_name,
    so.lead_technician_id as lead_tech_id,
    pm.full_name as pm_name,
    p.project_manager_id as pm_id,
    sr.full_name as sales_rep_name,
    so.created_by as sales_rep_id,
    so.test_tune_start_date,
    so.test_tune_end_date,
    so.total_estimated_labor_hours as total_estimated_labor,
    so.field_labor_target_hours as field_labor_target,
    COALESCE(labor.field_hours, 0) as field_hours_used,
    COALESCE(labor.pm_hours, 0) as pm_hours_used,
    COALESCE(labor.non_performance_hours, 0) as non_performance_hours,
    COALESCE(
      (SELECT COUNT(*) > 0
       FROM subscriptions sub
       WHERE sub.contact_id = so.contact_id
         AND sub.status IN ('active', 'trialing')
         AND sub.plan_type = 'vip'
      ), false
    ) as has_vip_membership,
    get_contact_portal_access_level(so.contact_id) as portal_access_level,
    COALESCE(
      (SELECT COUNT(*)::integer
       FROM punchlist_tasks pt
       WHERE pt.contact_id = so.contact_id
      ), 0
    ) as punchlist_item_count,
    COALESCE(
      (SELECT COUNT(*)::integer
       FROM work_orders wo
       WHERE wo.sales_order_id = so.id
      ), 0
    ) as work_order_count,
    so.contract_total
  FROM sales_orders so
  INNER JOIN contacts c ON c.id = so.contact_id
  LEFT JOIN projects p ON p.sales_order_id = so.id
  LEFT JOIN company_offices co ON co.id = so.office_id
  LEFT JOIN profiles lt ON lt.id = so.lead_technician_id
  LEFT JOIN profiles pm ON pm.id = p.project_manager_id
  LEFT JOIN profiles sr ON sr.id = so.created_by
  LEFT JOIN LATERAL (
    SELECT 
      SUM(CASE 
        WHEN lc.name = 'Field Labor' THEN COALESCE(wo.actual_hours, 0)
        ELSE 0
      END) as field_hours,
      SUM(CASE 
        WHEN lc.name = 'PM Labor' THEN COALESCE(wo.actual_hours, 0)
        ELSE 0
      END) as pm_hours,
      SUM(CASE 
        WHEN lc.name = 'Non-Performance Labor' THEN COALESCE(wo.actual_hours, 0)
        ELSE 0
      END) as non_performance_hours
    FROM work_orders wo
    LEFT JOIN labor_categories lc ON lc.id = wo.labor_category_id
    WHERE wo.sales_order_id = so.id
      AND wo.status = 'completed'
  ) labor ON true
  WHERE so.id = project_sales_order_id;
END;
$$;

-- Function to get work orders for a test & tune project
CREATE OR REPLACE FUNCTION get_test_tune_project_work_orders(project_sales_order_id uuid)
RETURNS TABLE (
  id uuid,
  work_order_number text,
  title text,
  work_order_type text,
  status text,
  scheduled_date date,
  completed_date timestamptz,
  estimated_hours numeric,
  actual_hours numeric,
  labor_category text,
  assigned_tech_name text,
  notes text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    wo.id,
    wo.work_order_number,
    wo.title,
    wo.work_order_type,
    wo.status,
    wo.scheduled_date,
    wo.completed_date,
    wo.estimated_hours,
    wo.actual_hours,
    COALESCE(lc.name, 'Unknown') as labor_category,
    t.full_name as assigned_tech_name,
    wo.notes,
    wo.created_at
  FROM work_orders wo
  LEFT JOIN labor_categories lc ON lc.id = wo.labor_category_id
  LEFT JOIN profiles t ON t.id = wo.assigned_tech_id
  WHERE wo.sales_order_id = project_sales_order_id
  ORDER BY wo.created_at DESC;
END;
$$;
