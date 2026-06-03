/*
  # Update Test & Tune Functions to Use Labor Phase Mapping v2

  1. Changes to get_test_tune_projects()
    - Replace labor_categories join with labor_phase_performance_mapping
    - Use counts_against_target boolean to determine field vs non-performance hours
    - Remove sales_rep_name (not in spec)
    - Remove has_vip_membership (not in spec)
    - Simplify to only field_hours_used (counts against target) and excluded_hours (doesn't count)

  2. Create get_test_tune_project_detail() function
    - Shows field target history for a specific project
    - Returns all recalculation events from change orders

  3. Notes
    - Aligns with original 90-Day Test & Tune spec
    - PM hours are calculated separately from field hours
    - Non-performance hours are those with counts_against_target = false
*/

-- Drop and recreate get_test_tune_projects function
DROP FUNCTION IF EXISTS get_test_tune_projects(boolean);

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
  target_recalculated boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    ) as target_recalculated
  FROM sales_orders so
  INNER JOIN contacts c ON c.id = so.contact_id
  LEFT JOIN projects p ON p.sales_order_id = so.id
  LEFT JOIN company_offices co ON co.id = so.office_id
  LEFT JOIN profiles lt ON lt.id = so.lead_technician_id
  LEFT JOIN profiles pm ON pm.id = p.project_manager_id
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

-- Drop and recreate get_test_tune_project_detail function
DROP FUNCTION IF EXISTS get_test_tune_project_detail(uuid);

CREATE OR REPLACE FUNCTION get_test_tune_project_detail(
  p_sales_order_id uuid
)
RETURNS TABLE (
  sales_order_id uuid,
  order_number text,
  contact_name text,
  current_total_labor numeric,
  current_field_target numeric,
  current_pm_allocation numeric,
  field_hours_used numeric,
  excluded_hours numeric,
  recalculation_count bigint,
  history jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    so.id as sales_order_id,
    so.order_number,
    c.full_name as contact_name,
    so.total_estimated_labor_hours as current_total_labor,
    so.field_labor_target_hours as current_field_target,
    so.pm_labor_allocation_hours as current_pm_allocation,
    COALESCE(labor.field_hours, 0) as field_hours_used,
    COALESCE(labor.excluded_hours, 0) as excluded_hours,
    (SELECT COUNT(*) FROM test_tune_field_target_history WHERE sales_order_id = p_sales_order_id) as recalculation_count,
    COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'date', h.recalculated_at,
          'change_order_number', h.change_order_number,
          'added_hours', h.added_labor_hours,
          'previous_target', h.previous_field_target_hours,
          'new_target', h.new_field_target_hours,
          'admin_name', p.full_name
        ) ORDER BY h.recalculated_at DESC
      )
      FROM test_tune_field_target_history h
      LEFT JOIN profiles p ON p.id = h.recalculated_by
      WHERE h.sales_order_id = p_sales_order_id
      ), '[]'::jsonb
    ) as history
  FROM sales_orders so
  INNER JOIN contacts c ON c.id = so.contact_id
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
  WHERE so.id = p_sales_order_id;
END;
$$;

-- Add helpful comments
COMMENT ON FUNCTION get_test_tune_projects(boolean) IS 'Returns all Test & Tune projects with labor tracking using labor_phase_performance_mapping. Field hours = phases with counts_against_target=true. Per original 90-Day Test & Tune spec.';

COMMENT ON FUNCTION get_test_tune_project_detail(uuid) IS 'Returns detailed Test & Tune project information including field target recalculation history from approved change orders.';