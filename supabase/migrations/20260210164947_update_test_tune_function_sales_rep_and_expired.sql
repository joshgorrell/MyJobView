/*
  # Update Test & Tune Function - Add Sales Rep and Expired Projects Support

  ## Summary
  Enhances the get_test_tune_projects function to include sales rep information and support filtering by expired status.

  ## Changes
  - Add sales_rep_name to the return type
  - Add include_expired parameter to filter active vs expired projects
  - Join with profiles table on created_by to get sales rep information
  - Check VIP membership status for expired projects
*/

-- Drop the existing function
DROP FUNCTION IF EXISTS get_test_tune_projects();

-- Create updated function with sales rep and expired filter
CREATE OR REPLACE FUNCTION get_test_tune_projects(
  include_expired boolean DEFAULT false
)
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
  sales_rep_name text,
  test_tune_start_date date,
  test_tune_end_date date,
  total_estimated_labor numeric,
  field_labor_target numeric,
  field_hours_used numeric,
  pm_hours_used numeric,
  non_performance_hours numeric,
  has_vip_membership boolean
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
    sr.full_name as sales_rep_name,
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
    ) as has_vip_membership
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
  WHERE so.test_tune_status = 'active'
    AND (
      include_expired = true 
      OR so.test_tune_end_date >= CURRENT_DATE
    )
  ORDER BY 
    CASE 
      WHEN so.test_tune_end_date >= CURRENT_DATE THEN 0
      ELSE 1
    END,
    so.test_tune_end_date ASC;
END;
$$;
