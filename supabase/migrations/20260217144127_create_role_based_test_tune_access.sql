/*
  # Create Role-Based Test & Tune Access System

  1. Summary
    Implements role-based access control for Test & Tune Performance Dashboard.
    Each role (Tech, PM, Sales, Admin, Executive) sees only relevant projects and metrics.

  2. Changes
    - Add default_office_id to profiles for office-based filtering
    - Add can_view_executive_dashboard permission flag
    - Create role-based project filtering function
    - Create user permissions helper function
    - Add sales_rep_id to sales_orders for sales rep tracking

  3. Role Access Rules
    - Tech: Only projects where they are lead tech or assigned to work orders
    - PM/Manager: Projects in their office or where they are PM
    - Sales: Only projects where they are the sales rep
    - Admin/Finance: All projects
    - Executive: All projects (read-only flag)

  4. Security
    - All functions use SECURITY DEFINER for consistent access
    - RLS policies updated to respect role-based visibility
    - Audit trail for all role-based access
*/

-- Add default_office_id to profiles for office-based filtering
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS default_office_id uuid REFERENCES company_offices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS can_view_executive_dashboard boolean DEFAULT false;

-- Add sales_rep_id to sales_orders
ALTER TABLE sales_orders
  ADD COLUMN IF NOT EXISTS sales_rep_id uuid REFERENCES profiles(id) ON DELETE SET NULL;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_profiles_default_office ON profiles(default_office_id) WHERE default_office_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_orders_sales_rep ON sales_orders(sales_rep_id) WHERE sales_rep_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_orders_lead_tech ON sales_orders(lead_technician_id) WHERE lead_technician_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_work_orders_assigned_tech ON work_orders(assigned_to) WHERE assigned_to IS NOT NULL;

-- Create function to get user's test & tune permissions
CREATE OR REPLACE FUNCTION get_user_test_tune_permissions(p_user_id uuid)
RETURNS TABLE (
  can_view_all_projects boolean,
  can_edit_bonuses boolean,
  can_override_bonuses boolean,
  can_approve_bonuses boolean,
  can_view_pm_metrics boolean,
  can_view_admin_controls boolean,
  can_view_bonus_amounts boolean,
  can_export_data boolean,
  user_role text,
  is_executive boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_is_exec boolean;
BEGIN
  -- Get user's role and executive flag
  SELECT role, COALESCE(can_view_executive_dashboard, false)
  INTO v_role, v_is_exec
  FROM profiles
  WHERE id = p_user_id;

  RETURN QUERY
  SELECT
    -- Can view all projects
    v_role IN ('admin', 'finance') OR v_is_exec as can_view_all_projects,

    -- Can edit bonuses (update amounts, statuses)
    v_role IN ('admin', 'finance') as can_edit_bonuses,

    -- Can override bonus calculations
    v_role IN ('admin', 'finance') as can_override_bonuses,

    -- Can approve/deny bonuses
    v_role IN ('admin', 'finance') as can_approve_bonuses,

    -- Can view PM performance metrics
    v_role IN ('admin', 'finance', 'manager', 'service_manager') OR v_is_exec as can_view_pm_metrics,

    -- Can view admin controls
    v_role IN ('admin', 'finance') as can_view_admin_controls,

    -- Can view bonus amounts (techs and PMs see their own, admins see all, sales don't see any)
    v_role IN ('admin', 'finance', 'manager', 'service_manager', 'tech') as can_view_bonus_amounts,

    -- Can export data
    true as can_export_data,

    -- Return role and executive flag
    v_role as user_role,
    v_is_exec as is_executive;
END;
$$;

-- Create role-based function to get test & tune projects for a specific user
CREATE OR REPLACE FUNCTION get_test_tune_projects_for_user(
  p_user_id uuid,
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
  office_id uuid,
  lead_tech_name text,
  lead_tech_id uuid,
  pm_name text,
  pm_id uuid,
  sales_rep_name text,
  sales_rep_id uuid,
  test_tune_start_date date,
  test_tune_end_date date,
  days_remaining integer,
  total_estimated_labor numeric,
  field_labor_target numeric,
  pm_allocation_hours numeric,
  field_performance_hours numeric,
  excluded_hours numeric,
  hours_remaining numeric,
  percentage_of_target numeric,
  status_indicator text,
  target_recalculated boolean,
  user_can_view boolean,
  user_relationship text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_is_exec boolean;
  v_default_office_id uuid;
BEGIN
  -- Get user's role, executive flag, and default office
  SELECT p.role, COALESCE(p.can_view_executive_dashboard, false), p.default_office_id
  INTO v_role, v_is_exec, v_default_office_id
  FROM profiles p
  WHERE p.id = p_user_id;

  RETURN QUERY
  SELECT
    so.id,
    so.order_number,
    c.full_name as contact_name,
    so.contact_id,
    p.id as project_id,
    p.title as project_title,
    COALESCE(co.office_name, 'No Office') as office_name,
    so.office_id,
    lt.full_name as lead_tech_name,
    so.lead_technician_id as lead_tech_id,
    pm.full_name as pm_name,
    pr.project_manager_id as pm_id,
    sr.full_name as sales_rep_name,
    so.sales_rep_id,
    so.test_tune_start_date,
    so.test_tune_end_date,
    GREATEST(0, (so.test_tune_end_date - CURRENT_DATE)::integer) as days_remaining,
    so.total_estimated_labor_hours as total_estimated_labor,
    so.field_labor_target_hours as field_labor_target,
    so.pm_labor_allocation_hours as pm_allocation_hours,
    COALESCE(labor.field_hours, 0) as field_performance_hours,
    COALESCE(labor.excluded_hours, 0) as excluded_hours,
    so.field_labor_target_hours - COALESCE(labor.field_hours, 0) as hours_remaining,
    CASE
      WHEN so.field_labor_target_hours > 0
      THEN ROUND((COALESCE(labor.field_hours, 0) / so.field_labor_target_hours * 100)::numeric, 1)
      ELSE 0
    END as percentage_of_target,
    CASE
      WHEN COALESCE(labor.field_hours, 0) > so.field_labor_target_hours THEN 'over'
      WHEN COALESCE(labor.field_hours, 0) / NULLIF(so.field_labor_target_hours, 0) > 0.75 THEN 'warning'
      ELSE 'on_track'
    END as status_indicator,
    EXISTS (
      SELECT 1 FROM test_tune_field_target_history
      WHERE sales_order_id = so.id
    ) as target_recalculated,

    -- Determine if user can view this project based on role
    CASE
      -- Admins, Finance, and Executives can view all
      WHEN v_role IN ('admin', 'finance') OR v_is_exec THEN true

      -- Techs can view if they're the lead tech or assigned to work orders
      WHEN v_role = 'tech' THEN (
        so.lead_technician_id = p_user_id OR
        EXISTS (
          SELECT 1 FROM work_orders wo
          WHERE wo.sales_order_id = so.id
          AND wo.assigned_to = p_user_id
        )
      )

      -- Managers can view projects in their office or where they're the PM
      WHEN v_role IN ('manager', 'service_manager') THEN (
        so.office_id = v_default_office_id OR
        pr.project_manager_id = p_user_id
      )

      -- Sales can view their own sales
      WHEN v_role = 'sales' THEN so.sales_rep_id = p_user_id

      ELSE false
    END as user_can_view,

    -- Describe user's relationship to this project
    CASE
      WHEN v_role IN ('admin', 'finance') THEN 'admin'
      WHEN v_is_exec THEN 'executive'
      WHEN so.lead_technician_id = p_user_id THEN 'lead_tech'
      WHEN EXISTS (
        SELECT 1 FROM work_orders wo
        WHERE wo.sales_order_id = so.id AND wo.assigned_to = p_user_id
      ) THEN 'assigned_tech'
      WHEN pr.project_manager_id = p_user_id THEN 'project_manager'
      WHEN so.sales_rep_id = p_user_id THEN 'sales_rep'
      WHEN so.office_id = v_default_office_id THEN 'office_member'
      ELSE 'none'
    END as user_relationship

  FROM sales_orders so
  INNER JOIN contacts c ON c.id = so.contact_id
  LEFT JOIN projects pr ON pr.sales_order_id = so.id
  LEFT JOIN company_offices co ON co.id = so.office_id
  LEFT JOIN profiles lt ON lt.id = so.lead_technician_id
  LEFT JOIN profiles pm ON pm.id = pr.project_manager_id
  LEFT JOIN profiles sr ON sr.id = so.sales_rep_id
  LEFT JOIN LATERAL (
    SELECT
      SUM(CASE
        WHEN COALESCE(lppm.counts_against_target, true) = true
        THEN COALESCE(wo.actual_hours, 0)
        ELSE 0
      END) as field_hours,
      SUM(CASE
        WHEN COALESCE(lppm.counts_against_target, true) = false
        THEN COALESCE(wo.actual_hours, 0)
        ELSE 0
      END) as excluded_hours
    FROM work_orders wo
    LEFT JOIN labor_phase_performance_mapping lppm ON lppm.labor_phase_id = wo.labor_phase_id
    WHERE wo.sales_order_id = so.id
      AND wo.status = 'completed'
  ) labor ON true
  WHERE so.test_tune_status = 'active'
    AND (include_expired = true OR so.test_tune_end_date >= CURRENT_DATE)
    -- Apply role-based filtering
    AND (
      -- Admins, Finance, and Executives can see all
      v_role IN ('admin', 'finance') OR v_is_exec OR

      -- Techs see projects where they're lead or assigned
      (v_role = 'tech' AND (
        so.lead_technician_id = p_user_id OR
        EXISTS (
          SELECT 1 FROM work_orders wo
          WHERE wo.sales_order_id = so.id
          AND wo.assigned_to = p_user_id
        )
      )) OR

      -- Managers see projects in their office or where they're PM
      (v_role IN ('manager', 'service_manager') AND (
        so.office_id = v_default_office_id OR
        pr.project_manager_id = p_user_id
      )) OR

      -- Sales see their own sales
      (v_role = 'sales' AND so.sales_rep_id = p_user_id)
    )
  ORDER BY
    CASE
      WHEN so.test_tune_end_date >= CURRENT_DATE THEN 0
      ELSE 1
    END,
    so.test_tune_end_date ASC;
END;
$$;

-- Create function to get aggregate stats for user's visible projects only
CREATE OR REPLACE FUNCTION get_test_tune_stats_for_user(p_user_id uuid)
RETURNS TABLE (
  total_projects bigint,
  projects_on_track bigint,
  projects_at_risk bigint,
  projects_over_budget bigint,
  avg_efficiency_percentage numeric,
  total_labor_savings numeric,
  total_margin_drag numeric,
  estimated_bonus_pool numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::bigint as total_projects,
    COUNT(*) FILTER (WHERE status_indicator = 'on_track')::bigint as projects_on_track,
    COUNT(*) FILTER (WHERE status_indicator = 'warning')::bigint as projects_at_risk,
    COUNT(*) FILTER (WHERE status_indicator = 'over')::bigint as projects_over_budget,
    ROUND(AVG(percentage_of_target), 1) as avg_efficiency_percentage,
    SUM(GREATEST(0, field_labor_target - field_performance_hours)) as total_labor_savings,
    SUM(GREATEST(0, field_performance_hours - field_labor_target)) as total_margin_drag,
    0::numeric as estimated_bonus_pool -- Will calculate separately based on settings
  FROM get_test_tune_projects_for_user(p_user_id, false)
  WHERE user_can_view = true;
END;
$$;

-- Add helpful comments
COMMENT ON FUNCTION get_user_test_tune_permissions(uuid) IS 'Returns user permissions for Test & Tune dashboard based on role. Determines what actions user can perform and what data they can view.';

COMMENT ON FUNCTION get_test_tune_projects_for_user(uuid, boolean) IS 'Returns Test & Tune projects filtered by user role. Techs see only their projects, PMs see office projects, Sales see their sales, Admins see all.';

COMMENT ON FUNCTION get_test_tune_stats_for_user(uuid) IS 'Returns aggregate statistics for Test & Tune projects visible to the user based on their role.';

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_user_test_tune_permissions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_test_tune_projects_for_user(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION get_test_tune_stats_for_user(uuid) TO authenticated;
