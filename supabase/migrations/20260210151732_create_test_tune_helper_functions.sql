/*
  # Create Test & Tune Helper Functions

  ## Summary
  Creates database functions to support the Test & Tune Performance Dashboard
  including project data retrieval and labor calculations.

  ## Functions
  - get_test_tune_projects: Returns all active test & tune projects with labor totals
*/

-- Create function to get all active test & tune projects with labor calculations
CREATE OR REPLACE FUNCTION get_test_tune_projects()
RETURNS TABLE (
  id uuid,
  order_number text,
  contact_name text,
  contact_id uuid,
  project_id uuid,
  project_title text,
  office_name text,
  lead_tech_name text,
  pm_name text,
  test_tune_start_date date,
  test_tune_end_date date,
  total_estimated_labor numeric,
  field_labor_target numeric,
  field_hours_used numeric,
  pm_hours_used numeric,
  non_performance_hours numeric
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
    p.id as project_id,
    p.title as project_title,
    COALESCE(co.office_name, 'No Office') as office_name,
    lt.full_name as lead_tech_name,
    pm.full_name as pm_name,
    so.test_tune_start_date,
    so.test_tune_end_date,
    so.total_estimated_labor_hours as total_estimated_labor,
    so.field_labor_target_hours as field_labor_target,
    COALESCE(labor.field_hours, 0) as field_hours_used,
    COALESCE(labor.pm_hours, 0) as pm_hours_used,
    COALESCE(labor.non_performance_hours, 0) as non_performance_hours
  FROM sales_orders so
  INNER JOIN contacts c ON c.id = so.contact_id
  LEFT JOIN projects p ON p.sales_order_id = so.id
  LEFT JOIN company_offices co ON co.id = so.office_id
  LEFT JOIN profiles lt ON lt.id = so.lead_technician_id
  LEFT JOIN profiles pm ON pm.id = p.project_manager_id
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
  WHERE so.test_tune_status = 'active'
  ORDER BY so.test_tune_end_date ASC;
END;
$$;