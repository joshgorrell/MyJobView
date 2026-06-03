/*
  # Add Role-Based Access Control to Project Detail Functions

  ## Summary
  Updates Test & Tune project detail functions to enforce role-based visibility.

  ## Changes
  - Updates `get_test_tune_project_detail` to check user permissions
  - Updates `get_test_tune_project_work_orders` to filter by role
  - Adds permission flags to detail output
  - Techs only see their work orders
  - Sales reps see no bonus information
  - PMs see office projects
  - Admins see everything

  ## Security
  - Enforces strict role-based data filtering
  - Returns null if user doesn't have access
  - Work orders filtered by assignment for techs
*/

-- Drop existing functions to change return type
DROP FUNCTION IF EXISTS get_test_tune_project_detail(uuid);
DROP FUNCTION IF EXISTS get_test_tune_project_work_orders(uuid);

-- Recreate project detail function with permission checking and flags
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
  contract_total numeric,
  -- Permission flags for UI
  can_view_bonus_amounts boolean,
  can_view_pm_metrics boolean,
  can_view_admin_controls boolean,
  can_view_all_work_orders boolean,
  user_has_access boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_user_role text;
  v_user_office_id uuid;
  v_is_admin boolean;
  v_is_manager boolean;
  v_is_sales boolean;
  v_is_tech boolean;
  v_is_lead_tech boolean;
  v_has_access boolean;
  v_can_view_bonus boolean;
  v_can_view_pm_metrics boolean;
  v_can_view_admin_controls boolean;
  v_can_view_all_wo boolean;
BEGIN
  -- Get current user
  v_user_id := auth.uid();

  -- Get user role and office
  SELECT role, default_office_id
  INTO v_user_role, v_user_office_id
  FROM profiles
  WHERE id = v_user_id;

  -- Determine role flags
  v_is_admin := v_user_role IN ('admin', 'super_admin');
  v_is_manager := v_user_role IN ('manager', 'sales_manager', 'service_manager');
  v_is_sales := v_user_role IN ('sales', 'sales_rep', 'sales_manager');
  v_is_tech := v_user_role IN ('tech', 'lead_tech', 'technician');

  -- Check if user is lead tech on this project
  v_is_lead_tech := EXISTS (
    SELECT 1 FROM sales_orders WHERE id = project_sales_order_id AND lead_technician_id = v_user_id
  );

  -- Determine access based on role
  v_has_access := CASE
    WHEN v_is_admin THEN true
    WHEN v_is_manager THEN EXISTS (
      SELECT 1 FROM sales_orders WHERE id = project_sales_order_id AND office_id = v_user_office_id
    )
    WHEN v_is_sales THEN EXISTS (
      SELECT 1 FROM sales_orders WHERE id = project_sales_order_id AND created_by = v_user_id
    )
    WHEN v_is_tech THEN (
      -- Tech must be lead tech OR assigned to a work order on this project
      v_is_lead_tech OR EXISTS (
        SELECT 1 FROM work_orders
        WHERE sales_order_id = project_sales_order_id
          AND assigned_tech_id = v_user_id
      )
    )
    ELSE false
  END;

  -- If no access, return empty result
  IF NOT v_has_access THEN
    RETURN;
  END IF;

  -- Set permission flags based on role
  v_can_view_bonus := v_is_admin OR v_is_manager OR v_is_tech;
  v_can_view_pm_metrics := v_is_admin OR v_is_manager;
  v_can_view_admin_controls := v_is_admin;
  v_can_view_all_wo := v_is_admin OR v_is_manager OR v_is_sales OR v_is_lead_tech;

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
    so.contract_total,
    v_can_view_bonus as can_view_bonus_amounts,
    v_can_view_pm_metrics as can_view_pm_metrics,
    v_can_view_admin_controls as can_view_admin_controls,
    v_can_view_all_wo as can_view_all_work_orders,
    v_has_access as user_has_access
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
        WHEN lpm.performance_category = 'Field Performance' THEN COALESCE(wo.actual_hours, 0)
        ELSE 0
      END) as field_hours,
      SUM(CASE
        WHEN lpm.performance_category = 'PM Non-Performance' THEN COALESCE(wo.actual_hours, 0)
        ELSE 0
      END) as pm_hours,
      SUM(CASE
        WHEN lpm.performance_category = 'Non-Performance' THEN COALESCE(wo.actual_hours, 0)
        ELSE 0
      END) as non_performance_hours
    FROM work_orders wo
    LEFT JOIN labor_phases lp ON lp.id = wo.labor_phase_id
    LEFT JOIN labor_phase_performance_mapping lpm ON lpm.labor_phase_id = lp.id
    WHERE wo.sales_order_id = so.id
      AND wo.status = 'completed'
  ) labor ON true
  WHERE so.id = project_sales_order_id;
END;
$$;

-- Recreate work orders function with role filtering
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
  assigned_tech_id uuid,
  notes text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_user_role text;
  v_user_office_id uuid;
  v_is_admin boolean;
  v_is_manager boolean;
  v_is_sales boolean;
  v_is_tech boolean;
  v_is_lead_tech boolean;
  v_show_all_work_orders boolean;
BEGIN
  -- Get current user
  v_user_id := auth.uid();

  -- Get user role and office
  SELECT role, default_office_id
  INTO v_user_role, v_user_office_id
  FROM profiles
  WHERE id = v_user_id;

  -- Determine role flags
  v_is_admin := v_user_role IN ('admin', 'super_admin');
  v_is_manager := v_user_role IN ('manager', 'sales_manager', 'service_manager');
  v_is_sales := v_user_role IN ('sales', 'sales_rep', 'sales_manager');
  v_is_tech := v_user_role IN ('tech', 'lead_tech', 'technician');

  -- Check if user is lead tech on this project
  v_is_lead_tech := EXISTS (
    SELECT 1 FROM sales_orders WHERE id = project_sales_order_id AND lead_technician_id = v_user_id
  );

  -- Determine if we show all work orders or filter
  v_show_all_work_orders := v_is_admin OR v_is_manager OR v_is_sales OR v_is_lead_tech;

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
    COALESCE(lp.name, 'Unknown') as labor_category,
    t.full_name as assigned_tech_name,
    wo.assigned_tech_id,
    wo.notes,
    wo.created_at
  FROM work_orders wo
  LEFT JOIN labor_phases lp ON lp.id = wo.labor_phase_id
  LEFT JOIN profiles t ON t.id = wo.assigned_tech_id
  WHERE wo.sales_order_id = project_sales_order_id
    AND (v_show_all_work_orders OR wo.assigned_tech_id = v_user_id)
  ORDER BY wo.created_at DESC;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_test_tune_project_detail(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_test_tune_project_work_orders(uuid) TO authenticated;

-- Add helpful comments
COMMENT ON FUNCTION get_test_tune_project_detail(uuid) IS 'Returns detailed Test & Tune project information with role-based access control. Includes permission flags for UI to conditionally render sections.';

COMMENT ON FUNCTION get_test_tune_project_work_orders(uuid) IS 'Returns work orders for a Test & Tune project filtered by user role. Techs see only their assigned work orders unless they are lead tech.';
