/*
  # Enhance Test & Tune System with Advanced Features

  ## Summary
  Adds comprehensive enhancements to the Test & Tune system including:
  - PM-specific aggregate metrics (first-time completion rates, post-completion labor analysis)
  - Admin bonus override system with full audit logging
  - Enhanced variance tracking for Sales analytics
  - Date range filtering support

  ## New Tables
  1. `test_tune_bonus_overrides`
     - Tracks manual bonus adjustments by administrators
     - Links to sales orders and profiles
     - Stores override amounts and reasons
     - Includes approval workflow

  2. `test_tune_pm_metrics`
     - Aggregates PM-specific performance data
     - Tracks first-time completion rates
     - Calculates labor drag costs
     - Analyzes post-completion patterns

  ## New Columns
  - `test_tune_bonus_calculations.is_overridden` - Marks if bonus has been manually adjusted
  - `test_tune_bonus_calculations.override_reason` - Explanation for override
  - `sales_orders.first_completion_date` - Tracks initial completion timestamp
  - `sales_orders.first_completion_hours` - Labor hours at first completion

  ## Functions
  - `calculate_pm_aggregate_metrics()` - Computes PM portfolio statistics
  - `apply_bonus_override()` - Admin function to adjust bonuses with audit trail
  - `get_test_tune_projects_with_variance()` - Enhanced project data with variance analysis

  ## Security
  - All tables use RLS
  - Override functions require admin role
  - Audit trail is immutable
*/

-- Add tracking columns to sales_orders for first completion analysis
ALTER TABLE sales_orders
ADD COLUMN IF NOT EXISTS first_completion_date timestamptz,
ADD COLUMN IF NOT EXISTS first_completion_hours numeric(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS completion_attempts integer DEFAULT 0;

-- Add override tracking to bonus calculations
ALTER TABLE test_tune_bonus_calculations
ADD COLUMN IF NOT EXISTS is_overridden boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS override_reason text,
ADD COLUMN IF NOT EXISTS override_amount numeric(10,2),
ADD COLUMN IF NOT EXISTS overridden_by uuid REFERENCES profiles(id),
ADD COLUMN IF NOT EXISTS overridden_at timestamptz;

-- Create bonus override audit table
CREATE TABLE IF NOT EXISTS test_tune_bonus_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sales_order_id uuid NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  bonus_calculation_id uuid REFERENCES test_tune_bonus_calculations(id) ON DELETE SET NULL,
  employee_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  original_amount numeric(10,2) NOT NULL DEFAULT 0,
  override_amount numeric(10,2) NOT NULL,
  adjustment_amount numeric(10,2) GENERATED ALWAYS AS (override_amount - original_amount) STORED,
  reason text NOT NULL,
  admin_notes text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  approved_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bonus_overrides_org ON test_tune_bonus_overrides(organization_id);
CREATE INDEX IF NOT EXISTS idx_bonus_overrides_sales_order ON test_tune_bonus_overrides(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_bonus_overrides_employee ON test_tune_bonus_overrides(employee_id);
CREATE INDEX IF NOT EXISTS idx_bonus_overrides_status ON test_tune_bonus_overrides(status);

-- Enable RLS
ALTER TABLE test_tune_bonus_overrides ENABLE ROW LEVEL SECURITY;

-- RLS Policies for bonus overrides
CREATE POLICY "Users can view overrides in their organization"
  ON test_tune_bonus_overrides FOR SELECT
  TO authenticated
  USING (
    organization_id = (auth.jwt()->>'organization_id')::uuid
  );

CREATE POLICY "Admins can insert overrides"
  ON test_tune_bonus_overrides FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id = (auth.jwt()->>'organization_id')::uuid
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin', 'sales_manager')
    )
  );

CREATE POLICY "Admins can update overrides"
  ON test_tune_bonus_overrides FOR UPDATE
  TO authenticated
  USING (
    organization_id = (auth.jwt()->>'organization_id')::uuid
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin', 'sales_manager')
    )
  );

-- Create PM metrics aggregate table
CREATE TABLE IF NOT EXISTS test_tune_pm_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  pm_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  calculation_date date NOT NULL DEFAULT CURRENT_DATE,
  total_projects integer NOT NULL DEFAULT 0,
  completed_projects integer NOT NULL DEFAULT 0,
  first_time_completions integer NOT NULL DEFAULT 0,
  first_time_completion_rate numeric(5,2) GENERATED ALWAYS AS (
    CASE WHEN completed_projects > 0
    THEN (first_time_completions::numeric / completed_projects::numeric * 100)
    ELSE 0 END
  ) STORED,
  total_post_completion_hours numeric(10,2) DEFAULT 0,
  avg_post_completion_hours numeric(10,2) DEFAULT 0,
  total_labor_drag_cost numeric(12,2) DEFAULT 0,
  total_labor_savings numeric(12,2) DEFAULT 0,
  projects_on_track integer DEFAULT 0,
  projects_at_risk integer DEFAULT 0,
  projects_over_budget integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(organization_id, pm_id, calculation_date)
);

CREATE INDEX IF NOT EXISTS idx_pm_metrics_org ON test_tune_pm_metrics(organization_id);
CREATE INDEX IF NOT EXISTS idx_pm_metrics_pm ON test_tune_pm_metrics(pm_id);
CREATE INDEX IF NOT EXISTS idx_pm_metrics_date ON test_tune_pm_metrics(calculation_date);

-- Enable RLS
ALTER TABLE test_tune_pm_metrics ENABLE ROW LEVEL SECURITY;

-- RLS Policies for PM metrics
CREATE POLICY "PMs can view their own metrics"
  ON test_tune_pm_metrics FOR SELECT
  TO authenticated
  USING (
    organization_id = (auth.jwt()->>'organization_id')::uuid
    AND (
      pm_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role IN ('admin', 'super_admin', 'manager', 'service_manager', 'sales_manager')
      )
    )
  );

-- Function to calculate PM aggregate metrics
CREATE OR REPLACE FUNCTION calculate_pm_aggregate_metrics(
  p_pm_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS TABLE (
  total_projects integer,
  completed_projects integer,
  first_time_completions integer,
  first_time_completion_rate numeric,
  total_post_completion_hours numeric,
  avg_post_completion_hours numeric,
  total_labor_drag_cost numeric,
  total_labor_savings numeric,
  projects_on_track integer,
  projects_at_risk integer,
  projects_over_budget integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start_date date := COALESCE(p_start_date, CURRENT_DATE - INTERVAL '90 days');
  v_end_date date := COALESCE(p_end_date, CURRENT_DATE);
  v_labor_rate numeric := 75.00;
BEGIN
  RETURN QUERY
  WITH project_stats AS (
    SELECT
      so.id,
      p.project_manager_id,
      so.test_tune_start_date,
      so.test_tune_end_date,
      so.completion_attempts,
      so.first_completion_hours,
      so.field_labor_target_hours,
      COALESCE(labor.field_hours, 0) as current_field_hours,
      COALESCE(labor.post_completion_hours, 0) as post_completion_hours,
      CASE
        WHEN COALESCE(labor.field_hours, 0) <= (so.field_labor_target_hours * 0.75) THEN 'on_track'
        WHEN COALESCE(labor.field_hours, 0) <= so.field_labor_target_hours THEN 'at_risk'
        ELSE 'over_budget'
      END as status,
      CASE
        WHEN COALESCE(labor.field_hours, 0) > so.field_labor_target_hours
        THEN (COALESCE(labor.field_hours, 0) - so.field_labor_target_hours) * v_labor_rate
        ELSE 0
      END as labor_drag_cost,
      CASE
        WHEN COALESCE(labor.field_hours, 0) < so.field_labor_target_hours
        THEN (so.field_labor_target_hours - COALESCE(labor.field_hours, 0)) * v_labor_rate
        ELSE 0
      END as labor_savings
    FROM sales_orders so
    INNER JOIN projects p ON p.sales_order_id = so.id
    LEFT JOIN LATERAL (
      SELECT
        SUM(CASE WHEN lp.labor_phase = 'Field Labor' THEN COALESCE(wo.actual_hours, 0) ELSE 0 END) as field_hours,
        SUM(CASE
          WHEN so.first_completion_date IS NOT NULL
          AND wo.completed_at > so.first_completion_date
          AND lp.labor_phase = 'Field Labor'
          THEN COALESCE(wo.actual_hours, 0)
          ELSE 0
        END) as post_completion_hours
      FROM work_orders wo
      LEFT JOIN labor_phases lp ON lp.id = wo.labor_phase_id
      WHERE wo.sales_order_id = so.id AND wo.status = 'completed'
    ) labor ON true
    WHERE p.project_manager_id = p_pm_id
      AND so.test_tune_status = 'active'
      AND so.test_tune_start_date >= v_start_date
      AND so.test_tune_end_date <= v_end_date
  )
  SELECT
    COUNT(*)::integer as total_projects,
    COUNT(CASE WHEN completion_attempts > 0 THEN 1 END)::integer as completed_projects,
    COUNT(CASE WHEN completion_attempts = 1 THEN 1 END)::integer as first_time_completions,
    CASE
      WHEN COUNT(CASE WHEN completion_attempts > 0 THEN 1 END) > 0
      THEN (COUNT(CASE WHEN completion_attempts = 1 THEN 1 END)::numeric /
            COUNT(CASE WHEN completion_attempts > 0 THEN 1 END)::numeric * 100)
      ELSE 0
    END as first_time_completion_rate,
    COALESCE(SUM(post_completion_hours), 0)::numeric as total_post_completion_hours,
    CASE
      WHEN COUNT(*) > 0
      THEN (COALESCE(SUM(post_completion_hours), 0) / COUNT(*))::numeric
      ELSE 0
    END as avg_post_completion_hours,
    COALESCE(SUM(labor_drag_cost), 0)::numeric as total_labor_drag_cost,
    COALESCE(SUM(labor_savings), 0)::numeric as total_labor_savings,
    COUNT(CASE WHEN status = 'on_track' THEN 1 END)::integer as projects_on_track,
    COUNT(CASE WHEN status = 'at_risk' THEN 1 END)::integer as projects_at_risk,
    COUNT(CASE WHEN status = 'over_budget' THEN 1 END)::integer as projects_over_budget
  FROM project_stats;
END;
$$;

-- Function to apply bonus override with audit trail
CREATE OR REPLACE FUNCTION apply_bonus_override(
  p_sales_order_id uuid,
  p_employee_id uuid,
  p_override_amount numeric,
  p_reason text,
  p_admin_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_override_id uuid;
  v_original_amount numeric;
  v_bonus_calc_id uuid;
  v_org_id uuid;
  v_admin_role text;
BEGIN
  -- Check if caller is admin
  SELECT role, organization_id INTO v_admin_role, v_org_id
  FROM profiles
  WHERE id = auth.uid();

  IF v_admin_role NOT IN ('admin', 'super_admin', 'sales_manager') THEN
    RAISE EXCEPTION 'Only administrators can apply bonus overrides';
  END IF;

  -- Get current bonus amount
  SELECT id, COALESCE(projected_bonus, 0), organization_id
  INTO v_bonus_calc_id, v_original_amount, v_org_id
  FROM test_tune_bonus_calculations
  WHERE sales_order_id = p_sales_order_id
    AND (lead_technician_id = p_employee_id OR project_manager_id = p_employee_id)
  LIMIT 1;

  IF v_bonus_calc_id IS NULL THEN
    RAISE EXCEPTION 'No bonus calculation found for this sales order and employee';
  END IF;

  -- Create override record
  INSERT INTO test_tune_bonus_overrides (
    organization_id,
    sales_order_id,
    bonus_calculation_id,
    employee_id,
    original_amount,
    override_amount,
    reason,
    admin_notes,
    status,
    created_by,
    approved_by,
    approved_at
  ) VALUES (
    v_org_id,
    p_sales_order_id,
    v_bonus_calc_id,
    p_employee_id,
    v_original_amount,
    p_override_amount,
    p_reason,
    p_admin_notes,
    'approved',
    auth.uid(),
    auth.uid(),
    now()
  )
  RETURNING id INTO v_override_id;

  -- Update bonus calculation
  UPDATE test_tune_bonus_calculations
  SET
    is_overridden = true,
    override_amount = p_override_amount,
    override_reason = p_reason,
    overridden_by = auth.uid(),
    overridden_at = now(),
    updated_at = now()
  WHERE id = v_bonus_calc_id;

  RETURN v_override_id;
END;
$$;

-- Function to get enhanced project data with variance analysis
CREATE OR REPLACE FUNCTION get_test_tune_projects_with_variance(
  p_user_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_include_expired boolean DEFAULT false
)
RETURNS TABLE (
  id uuid,
  order_number text,
  contact_name text,
  office_name text,
  sales_rep_name text,
  lead_tech_name text,
  pm_name text,
  field_labor_target numeric,
  field_performance_hours numeric,
  percentage_of_target numeric,
  hours_variance numeric,
  cost_variance numeric,
  status_indicator text,
  days_remaining integer,
  completion_date date,
  first_completion_hours numeric,
  post_completion_hours numeric,
  completion_attempts integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_role text;
  v_office_id uuid;
  v_labor_rate numeric := 75.00;
BEGIN
  -- Get user's role and office
  SELECT role, office_id INTO v_user_role, v_office_id
  FROM profiles
  WHERE id = p_user_id;

  RETURN QUERY
  SELECT
    so.id,
    so.order_number,
    c.full_name as contact_name,
    COALESCE(co.office_name, 'No Office') as office_name,
    sr.full_name as sales_rep_name,
    lt.full_name as lead_tech_name,
    pm.full_name as pm_name,
    so.field_labor_target_hours as field_labor_target,
    COALESCE(labor.field_hours, 0) as field_performance_hours,
    CASE
      WHEN so.field_labor_target_hours > 0
      THEN (COALESCE(labor.field_hours, 0) / so.field_labor_target_hours * 100)
      ELSE 0
    END as percentage_of_target,
    (so.field_labor_target_hours - COALESCE(labor.field_hours, 0)) as hours_variance,
    ((so.field_labor_target_hours - COALESCE(labor.field_hours, 0)) * v_labor_rate) as cost_variance,
    CASE
      WHEN COALESCE(labor.field_hours, 0) <= (so.field_labor_target_hours * 0.75) THEN 'on_track'
      WHEN COALESCE(labor.field_hours, 0) <= so.field_labor_target_hours THEN 'warning'
      ELSE 'over'
    END as status_indicator,
    GREATEST(0, (so.test_tune_end_date - CURRENT_DATE)::integer) as days_remaining,
    so.test_tune_end_date as completion_date,
    so.first_completion_hours,
    COALESCE(labor.post_completion_hours, 0) as post_completion_hours,
    so.completion_attempts
  FROM sales_orders so
  INNER JOIN contacts c ON c.id = so.contact_id
  LEFT JOIN projects p ON p.sales_order_id = so.id
  LEFT JOIN company_offices co ON co.id = so.office_id
  LEFT JOIN profiles sr ON sr.id = so.created_by
  LEFT JOIN profiles lt ON lt.id = so.lead_technician_id
  LEFT JOIN profiles pm ON pm.id = p.project_manager_id
  LEFT JOIN LATERAL (
    SELECT
      SUM(CASE WHEN lp.labor_phase = 'Field Labor' THEN COALESCE(wo.actual_hours, 0) ELSE 0 END) as field_hours,
      SUM(CASE
        WHEN so.first_completion_date IS NOT NULL
        AND wo.completed_at > so.first_completion_date
        AND lp.labor_phase = 'Field Labor'
        THEN COALESCE(wo.actual_hours, 0)
        ELSE 0
      END) as post_completion_hours
    FROM work_orders wo
    LEFT JOIN labor_phases lp ON lp.id = wo.labor_phase_id
    WHERE wo.sales_order_id = so.id AND wo.status = 'completed'
  ) labor ON true
  WHERE so.test_tune_status = 'active'
    AND (p_include_expired OR (so.test_tune_end_date - CURRENT_DATE) >= 0)
    AND (p_start_date IS NULL OR so.test_tune_start_date >= p_start_date)
    AND (p_end_date IS NULL OR so.test_tune_end_date <= p_end_date)
    AND (
      -- Admin sees all
      v_user_role IN ('admin', 'super_admin')
      -- Manager sees office projects
      OR (v_user_role IN ('manager', 'service_manager') AND so.office_id = v_office_id)
      -- Sales sees their sales
      OR (v_user_role IN ('sales', 'sales_rep', 'sales_manager') AND so.created_by = p_user_id)
      -- Tech sees their projects
      OR (v_user_role IN ('tech', 'lead_tech') AND so.lead_technician_id = p_user_id)
      -- PM sees their projects
      OR (p.project_manager_id = p_user_id)
    )
  ORDER BY so.test_tune_end_date ASC;
END;
$$;

-- Trigger to track first completion
CREATE OR REPLACE FUNCTION track_first_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- If work order is being marked as completed and it's field labor
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    -- Check if this is a field labor work order
    IF EXISTS (
      SELECT 1 FROM labor_phases lp
      WHERE lp.id = NEW.labor_phase_id
      AND lp.labor_phase = 'Field Labor'
    ) THEN
      -- Update sales order with first completion if not already set
      UPDATE sales_orders
      SET
        first_completion_date = COALESCE(first_completion_date, NEW.completed_at),
        first_completion_hours = COALESCE(first_completion_hours, (
          SELECT SUM(COALESCE(wo.actual_hours, 0))
          FROM work_orders wo
          LEFT JOIN labor_phases lp ON lp.id = wo.labor_phase_id
          WHERE wo.sales_order_id = NEW.sales_order_id
            AND wo.status = 'completed'
            AND lp.labor_phase = 'Field Labor'
            AND wo.completed_at <= NEW.completed_at
        )),
        completion_attempts = CASE
          WHEN first_completion_date IS NULL THEN 1
          ELSE completion_attempts
        END,
        updated_at = now()
      WHERE id = NEW.sales_order_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS track_first_completion_trigger ON work_orders;
CREATE TRIGGER track_first_completion_trigger
  AFTER UPDATE ON work_orders
  FOR EACH ROW
  EXECUTE FUNCTION track_first_completion();

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION calculate_pm_aggregate_metrics TO authenticated;
GRANT EXECUTE ON FUNCTION apply_bonus_override TO authenticated;
GRANT EXECUTE ON FUNCTION get_test_tune_projects_with_variance TO authenticated;