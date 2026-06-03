/*
  # Revise 90-Day Test & Tune Bonus System

  ## Summary of Changes

  ### Removed
  - Flat $150 on-target bonus (bonus_tier = 'on_target' now yields $0)
  - on_target_bonus_amount column no longer used (kept for backward compat, set to 0)

  ### New Columns on test_tune_settings
  - pm_allocation_percentage: Admin-configurable PM allocation %, default 5%
  - min_effective_labor_rate: Sales threshold for bonus eligibility, default $100/hr
  - max_bonus_pool_per_project: Optional cap, nullable
  - max_monthly_bonus_payout: Optional cap, nullable
  - min_project_size_for_bonus: Optional minimum contract size, nullable

  ### New Table: test_tune_settings_history
  - Logs every admin change to settings fields
  - Tracks: field name, old value, new value, changed_by, changed_at, effective_date, reason

  ### New Columns on test_tune_bonus_calculations
  - effective_labor_rate: Calculated at evaluation time (Total Labor Revenue / Est. Labor Hours)
  - sales_rep_eligible: Boolean flag, false if effective rate < threshold

  ### Updated calculate_test_tune_bonus Function
  - Removes on_target flat bonus
  - Adds sales rep eligibility check
  - Respects optional bonus caps
*/

-- ============================================================
-- 1. Update test_tune_settings table
-- ============================================================

DO $$
BEGIN
  -- PM Allocation Percentage (default 5%)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'test_tune_settings' AND column_name = 'pm_allocation_percentage'
  ) THEN
    ALTER TABLE test_tune_settings ADD COLUMN pm_allocation_percentage numeric NOT NULL DEFAULT 5.0;
  END IF;

  -- Minimum Effective Labor Rate threshold for sales eligibility (default $100/hr)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'test_tune_settings' AND column_name = 'min_effective_labor_rate'
  ) THEN
    ALTER TABLE test_tune_settings ADD COLUMN min_effective_labor_rate numeric NOT NULL DEFAULT 100.0;
  END IF;

  -- Optional bonus caps (all nullable = disabled by default)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'test_tune_settings' AND column_name = 'max_bonus_pool_per_project'
  ) THEN
    ALTER TABLE test_tune_settings ADD COLUMN max_bonus_pool_per_project numeric DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'test_tune_settings' AND column_name = 'max_monthly_bonus_payout'
  ) THEN
    ALTER TABLE test_tune_settings ADD COLUMN max_monthly_bonus_payout numeric DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'test_tune_settings' AND column_name = 'min_project_size_for_bonus'
  ) THEN
    ALTER TABLE test_tune_settings ADD COLUMN min_project_size_for_bonus numeric DEFAULT NULL;
  END IF;

  -- Zero out the flat on_target_bonus_amount (no longer used)
  UPDATE test_tune_settings SET on_target_bonus_amount = 0 WHERE on_target_bonus_amount > 0;
END $$;

-- ============================================================
-- 2. Create settings history table
-- ============================================================

CREATE TABLE IF NOT EXISTS test_tune_settings_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  field_name text NOT NULL,
  old_value text,
  new_value text NOT NULL,
  changed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  effective_date date,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE test_tune_settings_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage settings history"
  ON test_tune_settings_history
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super_admin', 'finance')
    )
  );

CREATE POLICY "Admins can insert settings history"
  ON test_tune_settings_history
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super_admin', 'finance', 'sales_manager')
    )
  );

CREATE INDEX IF NOT EXISTS idx_test_tune_settings_history_org_id
  ON test_tune_settings_history(organization_id);

CREATE INDEX IF NOT EXISTS idx_test_tune_settings_history_field_name
  ON test_tune_settings_history(field_name);

CREATE INDEX IF NOT EXISTS idx_test_tune_settings_history_changed_at
  ON test_tune_settings_history(changed_at DESC);

-- ============================================================
-- 3. Add new columns to test_tune_bonus_calculations
-- ============================================================

DO $$
BEGIN
  -- Effective labor rate at time of evaluation
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'test_tune_bonus_calculations' AND column_name = 'effective_labor_rate'
  ) THEN
    ALTER TABLE test_tune_bonus_calculations ADD COLUMN effective_labor_rate numeric DEFAULT NULL;
  END IF;

  -- Whether sales rep is eligible for sales bonus on this job
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'test_tune_bonus_calculations' AND column_name = 'sales_rep_eligible'
  ) THEN
    ALTER TABLE test_tune_bonus_calculations ADD COLUMN sales_rep_eligible boolean DEFAULT true;
  END IF;

  -- Optional: store the threshold used at time of evaluation
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'test_tune_bonus_calculations' AND column_name = 'effective_rate_threshold_used'
  ) THEN
    ALTER TABLE test_tune_bonus_calculations ADD COLUMN effective_rate_threshold_used numeric DEFAULT NULL;
  END IF;
END $$;

-- ============================================================
-- 4. Update calculate_test_tune_bonus function
--    - Remove flat on-target bonus
--    - Add sales rep eligibility check
--    - Respect optional bonus caps
-- ============================================================

CREATE OR REPLACE FUNCTION calculate_test_tune_bonus(
  p_sales_order_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings RECORD;
  v_sales_order RECORD;
  v_total_estimated_labor numeric := 0;
  v_field_labor_target numeric := 0;
  v_total_field_hours numeric := 0;
  v_labor_savings_hours numeric := 0;
  v_total_savings_amount numeric := 0;
  v_bonus_tier text := 'over_target';
  v_bonus_percentage numeric := 0;
  v_total_bonus_amount numeric := 0;
  v_tech_bonus_amount numeric := 0;
  v_pm_bonus_amount numeric := 0;
  v_lead_tech_id uuid;
  v_pm_id uuid;
  v_existing_calc_id uuid;
  v_total_labor_revenue numeric := 0;
  v_effective_labor_rate numeric := 0;
  v_sales_rep_eligible boolean := true;
  v_org_id uuid;
BEGIN
  -- Load settings
  SELECT * INTO v_settings
  FROM test_tune_settings
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Test & Tune settings not found';
  END IF;

  -- Load sales order
  SELECT
    so.*,
    p.total_price AS contract_total
  INTO v_sales_order
  FROM sales_orders so
  LEFT JOIN proposals p ON p.sales_order_id = so.id
  WHERE so.id = p_sales_order_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sales order not found: %', p_sales_order_id;
  END IF;

  v_org_id := v_sales_order.organization_id;

  -- Get lead tech and PM assignments
  v_lead_tech_id := v_sales_order.lead_technician_id;

  SELECT project_manager_id INTO v_pm_id
  FROM projects
  WHERE sales_order_id = p_sales_order_id
  LIMIT 1;

  -- Calculate estimated labor from proposal line items
  SELECT COALESCE(SUM(labor_hours), 0) INTO v_total_estimated_labor
  FROM proposal_line_items pli
  JOIN proposals pr ON pr.id = pli.proposal_id
  WHERE pr.sales_order_id = p_sales_order_id;

  -- Calculate total labor revenue for effective rate check
  SELECT COALESCE(SUM(
    CASE
      WHEN pli.item_type = 'labor' OR pli.labor_hours > 0
      THEN pli.total_price
      ELSE 0
    END
  ), 0) INTO v_total_labor_revenue
  FROM proposal_line_items pli
  JOIN proposals pr ON pr.id = pli.proposal_id
  WHERE pr.sales_order_id = p_sales_order_id;

  -- Compute effective labor rate (revenue / estimated hours)
  IF v_total_estimated_labor > 0 THEN
    v_effective_labor_rate := v_total_labor_revenue / v_total_estimated_labor;
  ELSE
    v_effective_labor_rate := 0;
  END IF;

  -- Determine sales rep eligibility
  IF v_effective_labor_rate < v_settings.min_effective_labor_rate THEN
    v_sales_rep_eligible := false;
  END IF;

  -- Field Labor Target = Total Estimated Labor × 95%
  v_field_labor_target := v_total_estimated_labor * 0.95;

  -- Get field performance hours from linked work orders (using labor phase mapping)
  SELECT COALESCE(SUM(wo.actual_hours), 0) INTO v_total_field_hours
  FROM work_orders wo
  LEFT JOIN labor_phase_performance_mapping lppm ON lppm.labor_phase_id = wo.labor_category_id
  WHERE wo.sales_order_id = p_sales_order_id
    AND wo.status = 'completed'
    AND (lppm.performance_category = 'field_performance' OR wo.labor_category_id IS NULL);

  -- Calculate savings (positive = under target = good)
  v_labor_savings_hours := v_field_labor_target - v_total_field_hours;

  -- Determine tier and bonus
  -- NEW RULE: bonus only if field labor is STRICTLY below target (savings > 0)
  -- No flat bonus for on-target; on_target (savings = 0) yields $0
  IF v_labor_savings_hours <= 0 THEN
    -- Over target or exactly on target: no bonus
    v_bonus_tier := CASE WHEN v_labor_savings_hours = 0 THEN 'on_target' ELSE 'over_target' END;
    v_bonus_percentage := 0;
    v_total_bonus_amount := 0;
  ELSE
    -- Savings > 0: determine tier
    v_total_savings_amount := v_labor_savings_hours * v_settings.default_labor_burden_rate;

    IF v_labor_savings_hours >= v_settings.tier_3_min_hours THEN
      v_bonus_tier := 'tier_3';
      v_bonus_percentage := v_settings.tier_3_percentage;
    ELSIF v_labor_savings_hours >= v_settings.tier_2_min_hours THEN
      v_bonus_tier := 'tier_2';
      v_bonus_percentage := v_settings.tier_2_percentage;
    ELSIF v_labor_savings_hours >= v_settings.tier_1_min_hours THEN
      v_bonus_tier := 'tier_1';
      v_bonus_percentage := v_settings.tier_1_percentage;
    ELSE
      -- Below minimum tier threshold (fractional savings)
      v_bonus_tier := 'no_tier';
      v_bonus_percentage := 0;
    END IF;

    v_total_bonus_amount := v_total_savings_amount * (v_bonus_percentage / 100.0);

    -- Apply optional per-project cap
    IF v_settings.max_bonus_pool_per_project IS NOT NULL AND v_total_bonus_amount > v_settings.max_bonus_pool_per_project THEN
      v_total_bonus_amount := v_settings.max_bonus_pool_per_project;
    END IF;
  END IF;

  -- Split bonus between tech and PM
  v_tech_bonus_amount := v_total_bonus_amount * (v_settings.tech_bonus_percentage / 100.0);
  v_pm_bonus_amount := v_total_bonus_amount * (v_settings.pm_bonus_percentage / 100.0);

  -- Upsert bonus calculation record
  SELECT id INTO v_existing_calc_id
  FROM test_tune_bonus_calculations
  WHERE sales_order_id = p_sales_order_id
  LIMIT 1;

  IF v_existing_calc_id IS NOT NULL THEN
    UPDATE test_tune_bonus_calculations SET
      evaluation_date = now(),
      total_estimated_labor = v_total_estimated_labor,
      field_labor_target = v_field_labor_target,
      total_field_hours = v_total_field_hours,
      labor_savings_hours = GREATEST(0, v_labor_savings_hours),
      labor_burden_rate = v_settings.default_labor_burden_rate,
      total_savings_amount = GREATEST(0, v_total_savings_amount),
      bonus_tier = v_bonus_tier,
      bonus_percentage = v_bonus_percentage,
      total_bonus_amount = v_total_bonus_amount,
      tech_bonus_amount = v_tech_bonus_amount,
      pm_bonus_amount = v_pm_bonus_amount,
      lead_technician_id = v_lead_tech_id,
      project_manager_id = v_pm_id,
      status = 'provisional',
      effective_labor_rate = v_effective_labor_rate,
      sales_rep_eligible = v_sales_rep_eligible,
      effective_rate_threshold_used = v_settings.min_effective_labor_rate,
      updated_at = now()
    WHERE id = v_existing_calc_id;
  ELSE
    INSERT INTO test_tune_bonus_calculations (
      organization_id,
      sales_order_id,
      evaluation_date,
      total_estimated_labor,
      field_labor_target,
      total_field_hours,
      labor_savings_hours,
      labor_burden_rate,
      total_savings_amount,
      bonus_tier,
      bonus_percentage,
      total_bonus_amount,
      tech_bonus_amount,
      pm_bonus_amount,
      lead_technician_id,
      project_manager_id,
      status,
      effective_labor_rate,
      sales_rep_eligible,
      effective_rate_threshold_used
    ) VALUES (
      v_org_id,
      p_sales_order_id,
      now(),
      v_total_estimated_labor,
      v_field_labor_target,
      v_total_field_hours,
      GREATEST(0, v_labor_savings_hours),
      v_settings.default_labor_burden_rate,
      GREATEST(0, v_total_savings_amount),
      v_bonus_tier,
      v_bonus_percentage,
      v_total_bonus_amount,
      v_tech_bonus_amount,
      v_pm_bonus_amount,
      v_lead_tech_id,
      v_pm_id,
      'provisional',
      v_effective_labor_rate,
      v_sales_rep_eligible,
      v_settings.min_effective_labor_rate
    );
  END IF;

EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Error in calculate_test_tune_bonus for order %: %', p_sales_order_id, SQLERRM;
  RAISE;
END;
$$;
