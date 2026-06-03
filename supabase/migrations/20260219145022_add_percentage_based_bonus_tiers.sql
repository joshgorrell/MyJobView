/*
  # Add Percentage-Based Bonus Tiers to Test & Tune

  ## Summary
  Adds support for configuring Performance Bonus Tiers using a percentage of estimated
  labor hours saved, rather than flat hour thresholds. This allows the bonus system to
  scale proportionally with job size — a small job and a large job are evaluated on equal
  footing.

  ## Changes

  ### 1. New Column: test_tune_settings.bonus_tier_type
  - Type: text, default 'flat_hours'
  - Values: 'flat_hours' (existing behavior) | 'pct_of_estimated' (new percentage mode)

  ### 2. Updated JSONB Tier Structure
  - When tier_type = 'pct_of_estimated', tiers use min_pct / max_pct fields instead of
    min_hours / max_hours
  - Existing flat_hours tiers are unchanged (backward compatible)
  - The bonus_tiers_jsonb column stores both field names; the active fields depend on
    bonus_tier_type

  ### 3. New Column: test_tune_bonus_calculations.labor_savings_pct
  - Stores the savings as a percentage of estimated labor at evaluation time
  - Populated regardless of tier mode for display/audit purposes

  ### 4. Updated calculate_test_tune_bonus Function
  - Reads bonus_tier_type from settings
  - In pct_of_estimated mode: computes savings % = (labor_savings_hours / total_estimated_labor) * 100
    and compares against min_pct / max_pct in each tier
  - In flat_hours mode: existing behavior unchanged

  ### 5. Updated get_test_tune_projects_for_user Function
  - Returns labor_savings_pct alongside existing fields
  - Returns bonus_tier_type so the UI knows which mode is active

  ## Security
  - No new tables — existing RLS policies apply
  - Function uses SECURITY DEFINER (unchanged)
*/

-- ============================================================
-- 1. Add bonus_tier_type to test_tune_settings
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'test_tune_settings' AND column_name = 'bonus_tier_type'
  ) THEN
    ALTER TABLE test_tune_settings
      ADD COLUMN bonus_tier_type text NOT NULL DEFAULT 'flat_hours'
      CHECK (bonus_tier_type IN ('flat_hours', 'pct_of_estimated'));
  END IF;
END $$;

-- ============================================================
-- 2. Add labor_savings_pct to test_tune_bonus_calculations
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'test_tune_bonus_calculations' AND column_name = 'labor_savings_pct'
  ) THEN
    ALTER TABLE test_tune_bonus_calculations
      ADD COLUMN labor_savings_pct numeric DEFAULT NULL;
  END IF;
END $$;

-- ============================================================
-- 3. Update calculate_test_tune_bonus to support pct_of_estimated mode
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
  v_labor_savings_pct numeric := 0;
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
  v_tier_type text;
  v_comparison_value numeric;
BEGIN
  -- Load settings
  SELECT * INTO v_settings
  FROM test_tune_settings
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Test & Tune settings not found';
  END IF;

  v_tier_type := COALESCE(v_settings.bonus_tier_type, 'flat_hours');

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

  -- Calculate savings as a percentage of total estimated labor (for display and pct mode)
  IF v_total_estimated_labor > 0 THEN
    v_labor_savings_pct := ROUND((v_labor_savings_hours / v_total_estimated_labor * 100)::numeric, 2);
  ELSE
    v_labor_savings_pct := 0;
  END IF;

  -- Determine tier and bonus
  IF v_labor_savings_hours <= 0 THEN
    v_bonus_tier := CASE WHEN v_labor_savings_hours = 0 THEN 'on_target' ELSE 'over_target' END;
    v_bonus_percentage := 0;
    v_total_bonus_amount := 0;
  ELSE
    v_total_savings_amount := v_labor_savings_hours * v_settings.default_labor_burden_rate;
    v_bonus_tier := 'no_tier';
    v_bonus_percentage := 0;

    -- The value we compare against tier thresholds depends on the tier type
    -- pct_of_estimated: compare savings % against min_pct / max_pct
    -- flat_hours: compare raw hours saved against min_hours / max_hours
    IF v_tier_type = 'pct_of_estimated' THEN
      v_comparison_value := GREATEST(0, v_labor_savings_pct);
    ELSE
      v_comparison_value := v_labor_savings_hours;
    END IF;

    -- Use bonus_tiers_jsonb if present (supports unlimited tiers)
    IF v_settings.bonus_tiers_jsonb IS NOT NULL AND jsonb_array_length(v_settings.bonus_tiers_jsonb) > 0 THEN
      FOR v_tier_record IN
        SELECT * FROM jsonb_array_elements(v_settings.bonus_tiers_jsonb)
      LOOP
        IF v_tier_type = 'pct_of_estimated' THEN
          -- Read min_pct / max_pct fields for percentage mode
          v_tier_min := COALESCE((v_tier_record->>'min_pct')::numeric, 0);
          v_tier_max := CASE
            WHEN v_tier_record->>'max_pct' IS NULL OR v_tier_record->>'max_pct' = 'null' THEN NULL
            ELSE (v_tier_record->>'max_pct')::numeric
          END;
        ELSE
          -- Read min_hours / max_hours fields for flat mode
          v_tier_min := COALESCE((v_tier_record->>'min_hours')::numeric, 0);
          v_tier_max := CASE
            WHEN v_tier_record->>'max_hours' IS NULL OR v_tier_record->>'max_hours' = 'null' THEN NULL
            ELSE (v_tier_record->>'max_hours')::numeric
          END;
        END IF;

        v_tier_pct := COALESCE((v_tier_record->>'percentage')::numeric, 0);

        IF v_comparison_value >= v_tier_min AND (v_tier_max IS NULL OR v_comparison_value <= v_tier_max) THEN
          v_bonus_tier := 'tier_jsonb';
          v_bonus_percentage := v_tier_pct;
        END IF;
      END LOOP;
    ELSE
      -- Fallback to legacy 3-tier columns (flat hours only)
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
      labor_savings_pct = GREATEST(0, v_labor_savings_pct),
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
      labor_savings_pct,
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
      GREATEST(0, v_labor_savings_pct),
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
--    labor_savings_pct and bonus_tier_type
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
  elr_override_active boolean,
  labor_savings_pct numeric,
  bonus_tier_type text
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
  v_bonus_tier_type text;
BEGIN
  -- Get user's role, executive flag, and default office
  SELECT p.role, COALESCE(p.can_view_executive_dashboard, false), p.default_office_id
  INTO v_role, v_is_exec, v_default_office_id
  FROM profiles p
  WHERE p.id = p_user_id;

  -- Get global threshold and tier type from settings
  SELECT
    COALESCE(min_effective_labor_rate, 100),
    COALESCE(bonus_tier_type, 'flat_hours')
  INTO v_global_threshold, v_bonus_tier_type
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
    (so.min_effective_labor_rate_override IS NOT NULL) as elr_override_active,

    -- Savings percentage (from bonus calc if available, computed live otherwise)
    COALESCE(
      bc.labor_savings_pct,
      CASE
        WHEN so.total_estimated_labor_hours > 0
        THEN ROUND(
          ((so.field_labor_target_hours - COALESCE(labor.field_hours, 0)) / so.total_estimated_labor_hours * 100)::numeric,
          2
        )
        ELSE 0
      END
    ) as labor_savings_pct,

    v_bonus_tier_type as bonus_tier_type

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
    SELECT sales_rep_eligible, effective_labor_rate, labor_savings_pct
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
