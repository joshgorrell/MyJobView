/*
  # Remaining Test & Tune Spec Items

  ## Summary
  Implements the three remaining items from the Test & Tune spec:

  ## 1. Per-Job Effective Labor Rate Threshold Override
  - New column `sales_orders.min_effective_labor_rate_override` (nullable numeric)
  - New column `sales_orders.min_effective_labor_rate_override_reason` (text)
  - When set, this job uses the override value instead of the global setting
  - New table `test_tune_elr_override_log` — audit trail for per-job overrides

  ## 2. JSONB Bonus Tiers (Unlimited Tier Support)
  - New column `test_tune_settings.bonus_tiers_jsonb` (jsonb)
    - Structure: [{min_hours, max_hours, percentage}, ...]
    - max_hours is null for the last (open-ended) tier
  - `calculate_test_tune_bonus` updated to read from bonus_tiers_jsonb when present,
    falling back to the legacy 3-tier columns for backward compatibility

  ## 3. sales_rep_eligible in get_test_tune_projects_for_user
  - Function updated to LEFT JOIN test_tune_bonus_calculations
  - Returns `sales_rep_eligible` (boolean, nullable — null means not yet evaluated)
  - Returns `effective_labor_rate` (numeric, nullable)
  - Returns `effective_rate_threshold` (numeric — the threshold that applies to this job)
*/

-- ============================================================
-- 1. Per-Job ELR Override
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales_orders' AND column_name = 'min_effective_labor_rate_override'
  ) THEN
    ALTER TABLE sales_orders
      ADD COLUMN min_effective_labor_rate_override numeric DEFAULT NULL,
      ADD COLUMN min_effective_labor_rate_override_reason text DEFAULT NULL;
  END IF;
END $$;

-- Audit table for per-job ELR overrides
CREATE TABLE IF NOT EXISTS test_tune_elr_override_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  sales_order_id uuid NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  changed_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  old_override numeric,
  new_override numeric,
  reason text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_elr_override_log_order ON test_tune_elr_override_log(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_elr_override_log_changed_at ON test_tune_elr_override_log(changed_at DESC);

ALTER TABLE test_tune_elr_override_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view ELR override log"
  ON test_tune_elr_override_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin', 'finance', 'sales_manager')
    )
  );

CREATE POLICY "Admins can insert ELR override log"
  ON test_tune_elr_override_log FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin', 'finance', 'sales_manager')
    )
  );

-- ============================================================
-- 2. JSONB Bonus Tiers Column
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'test_tune_settings' AND column_name = 'bonus_tiers_jsonb'
  ) THEN
    ALTER TABLE test_tune_settings
      ADD COLUMN bonus_tiers_jsonb jsonb DEFAULT NULL;
  END IF;
END $$;

-- Seed bonus_tiers_jsonb from existing 3-tier columns for the first row
UPDATE test_tune_settings
SET bonus_tiers_jsonb = jsonb_build_array(
  jsonb_build_object('min_hours', tier_1_min_hours, 'max_hours', tier_1_max_hours, 'percentage', tier_1_percentage),
  jsonb_build_object('min_hours', tier_2_min_hours, 'max_hours', tier_2_max_hours, 'percentage', tier_2_percentage),
  jsonb_build_object('min_hours', tier_3_min_hours, 'max_hours', NULL, 'percentage', tier_3_percentage)
)
WHERE bonus_tiers_jsonb IS NULL;

-- ============================================================
-- 3. Update calculate_test_tune_bonus to use bonus_tiers_jsonb
--    and respect per-job ELR override
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
  v_tier_record jsonb;
  v_tier_min numeric;
  v_tier_max numeric;
  v_tier_pct numeric;
  v_effective_threshold numeric;
BEGIN
  -- Load settings
  SELECT * INTO v_settings
  FROM test_tune_settings
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Test & Tune settings not found';
  END IF;

  -- Load sales order (with per-job ELR override)
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

  -- Determine effective ELR threshold (per-job override takes precedence)
  v_effective_threshold := COALESCE(
    v_sales_order.min_effective_labor_rate_override,
    v_settings.min_effective_labor_rate
  );

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

  -- Determine sales rep eligibility using effective threshold
  IF v_effective_labor_rate < v_effective_threshold THEN
    v_sales_rep_eligible := false;
  END IF;

  -- Field Labor Target = Total Estimated Labor × 95%
  v_field_labor_target := v_total_estimated_labor * 0.95;

  -- Get field performance hours from linked work orders (using labor phase mapping)
  SELECT COALESCE(SUM(wo.actual_hours), 0) INTO v_total_field_hours
  FROM work_orders wo
  LEFT JOIN labor_phase_performance_mapping lppm ON lppm.labor_phase_id = wo.labor_phase_id
  WHERE wo.sales_order_id = p_sales_order_id
    AND wo.status = 'completed'
    AND COALESCE(lppm.counts_against_target, true) = true;

  -- Calculate savings (positive = under target = good)
  v_labor_savings_hours := v_field_labor_target - v_total_field_hours;

  -- Determine tier and bonus
  IF v_labor_savings_hours <= 0 THEN
    v_bonus_tier := CASE WHEN v_labor_savings_hours = 0 THEN 'on_target' ELSE 'over_target' END;
    v_bonus_percentage := 0;
    v_total_bonus_amount := 0;
  ELSE
    v_total_savings_amount := v_labor_savings_hours * v_settings.default_labor_burden_rate;
    v_bonus_tier := 'no_tier';
    v_bonus_percentage := 0;

    -- Use bonus_tiers_jsonb if present (supports unlimited tiers)
    IF v_settings.bonus_tiers_jsonb IS NOT NULL AND jsonb_array_length(v_settings.bonus_tiers_jsonb) > 0 THEN
      FOR v_tier_record IN
        SELECT * FROM jsonb_array_elements(v_settings.bonus_tiers_jsonb)
      LOOP
        v_tier_min := (v_tier_record->>'min_hours')::numeric;
        v_tier_max := CASE
          WHEN v_tier_record->>'max_hours' IS NULL THEN NULL
          ELSE (v_tier_record->>'max_hours')::numeric
        END;
        v_tier_pct := (v_tier_record->>'percentage')::numeric;

        IF v_labor_savings_hours >= v_tier_min AND (v_tier_max IS NULL OR v_labor_savings_hours <= v_tier_max) THEN
          v_bonus_tier := 'tier_jsonb';
          v_bonus_percentage := v_tier_pct;
        END IF;
      END LOOP;
    ELSE
      -- Fallback to legacy 3-tier columns
      IF v_labor_savings_hours >= v_settings.tier_3_min_hours THEN
        v_bonus_tier := 'tier_3';
        v_bonus_percentage := v_settings.tier_3_percentage;
      ELSIF v_labor_savings_hours >= v_settings.tier_2_min_hours THEN
        v_bonus_tier := 'tier_2';
        v_bonus_percentage := v_settings.tier_2_percentage;
      ELSIF v_labor_savings_hours >= v_settings.tier_1_min_hours THEN
        v_bonus_tier := 'tier_1';
        v_bonus_percentage := v_settings.tier_1_percentage;
      END IF;
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
      effective_rate_threshold_used = v_effective_threshold,
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
      v_effective_threshold
    );
  END IF;

EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Error in calculate_test_tune_bonus for order %: %', p_sales_order_id, SQLERRM;
  RAISE;
END;
$$;

-- ============================================================
-- 4. Update get_test_tune_projects_for_user to return
--    sales_rep_eligible, effective_labor_rate, effective_rate_threshold
-- ============================================================

DROP FUNCTION IF EXISTS get_test_tune_projects_for_user(uuid, boolean);

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
  user_relationship text,
  sales_rep_eligible boolean,
  effective_labor_rate numeric,
  effective_rate_threshold numeric,
  elr_override_active boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_is_exec boolean;
  v_default_office_id uuid;
  v_global_threshold numeric;
BEGIN
  -- Get user's role, executive flag, and default office
  SELECT p.role, COALESCE(p.can_view_executive_dashboard, false), p.default_office_id
  INTO v_role, v_is_exec, v_default_office_id
  FROM profiles p
  WHERE p.id = p_user_id;

  -- Get global threshold from settings
  SELECT COALESCE(min_effective_labor_rate, 100)
  INTO v_global_threshold
  FROM test_tune_settings
  LIMIT 1;

  RETURN QUERY
  SELECT
    so.id,
    so.order_number,
    c.full_name as contact_name,
    so.contact_id,
    pr.id as project_id,
    pr.title as project_title,
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

    -- Role-based view permission
    CASE
      WHEN v_role IN ('admin', 'finance') OR v_is_exec THEN true
      WHEN v_role = 'tech' THEN (
        so.lead_technician_id = p_user_id OR
        EXISTS (
          SELECT 1 FROM work_orders wo
          WHERE wo.sales_order_id = so.id AND wo.assigned_to = p_user_id
        )
      )
      WHEN v_role IN ('manager', 'service_manager') THEN (
        so.office_id = v_default_office_id OR pr.project_manager_id = p_user_id
      )
      WHEN v_role = 'sales' THEN so.sales_rep_id = p_user_id
      ELSE false
    END as user_can_view,

    -- User relationship descriptor
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
    END as user_relationship,

    -- ELR fields from bonus calculations (NULL if not yet evaluated)
    bc.sales_rep_eligible,
    bc.effective_labor_rate,
    COALESCE(so.min_effective_labor_rate_override, v_global_threshold) as effective_rate_threshold,
    (so.min_effective_labor_rate_override IS NOT NULL) as elr_override_active

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
  LEFT JOIN LATERAL (
    SELECT sales_rep_eligible, effective_labor_rate
    FROM test_tune_bonus_calculations
    WHERE sales_order_id = so.id
    ORDER BY updated_at DESC
    LIMIT 1
  ) bc ON true
  WHERE so.test_tune_status = 'active'
    AND (include_expired = true OR so.test_tune_end_date >= CURRENT_DATE)
    AND (
      v_role IN ('admin', 'finance') OR v_is_exec OR
      (v_role = 'tech' AND (
        so.lead_technician_id = p_user_id OR
        EXISTS (
          SELECT 1 FROM work_orders wo
          WHERE wo.sales_order_id = so.id AND wo.assigned_to = p_user_id
        )
      )) OR
      (v_role IN ('manager', 'service_manager') AND (
        so.office_id = v_default_office_id OR pr.project_manager_id = p_user_id
      )) OR
      (v_role = 'sales' AND so.sales_rep_id = p_user_id)
    )
  ORDER BY
    CASE WHEN so.test_tune_end_date >= CURRENT_DATE THEN 0 ELSE 1 END,
    so.test_tune_end_date ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_test_tune_projects_for_user(uuid, boolean) TO authenticated;

-- ============================================================
-- 5. Function to set per-job ELR override with audit logging
-- ============================================================

CREATE OR REPLACE FUNCTION set_job_elr_override(
  p_sales_order_id uuid,
  p_override_rate numeric,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_override numeric;
  v_org_id uuid;
  v_role text;
BEGIN
  -- Check permission
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role NOT IN ('admin', 'super_admin', 'finance', 'sales_manager') THEN
    RAISE EXCEPTION 'Only administrators can set per-job ELR overrides';
  END IF;

  -- Get current state
  SELECT min_effective_labor_rate_override, organization_id
  INTO v_old_override, v_org_id
  FROM sales_orders
  WHERE id = p_sales_order_id;

  -- Update
  UPDATE sales_orders
  SET
    min_effective_labor_rate_override = p_override_rate,
    min_effective_labor_rate_override_reason = p_reason,
    updated_at = now()
  WHERE id = p_sales_order_id;

  -- Audit log
  INSERT INTO test_tune_elr_override_log (
    organization_id,
    sales_order_id,
    changed_by,
    old_override,
    new_override,
    reason
  ) VALUES (
    v_org_id,
    p_sales_order_id,
    auth.uid(),
    v_old_override,
    p_override_rate,
    p_reason
  );
END;
$$;

GRANT EXECUTE ON FUNCTION set_job_elr_override(uuid, numeric, text) TO authenticated;
