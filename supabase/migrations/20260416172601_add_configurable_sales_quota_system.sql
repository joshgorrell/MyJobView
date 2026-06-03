/*
  # Configurable Sales Quota System with Anniversary-Year Calculation

  ## Summary
  Adds a comprehensive, configurable sales quota system that computes each rep's current
  annual quota based on their anniversary year (not calendar year), using either a base
  quota + escalation path or a custom base + escalation path. Falls back to the escalation
  path automatically when no historical revenue exists.

  ## Changes to `organizations`
  - Adds `default_base_annual_quota` (default 500000) - org-wide starting quota for Year 1
  - Adds `default_quota_escalation_percentage` (default 5.00) - year-over-year growth %
  - Adds `default_quota_rolling_average_years` (default 3) - window for trailing average

  ## Changes to `profiles`
  - Adds `sales_rep_start_date` (date) - anniversary clock start
  - Adds `quota_mode` (text) - 'base_plus_escalation' or 'custom_plus_escalation'
  - Adds `custom_base_quota` (numeric, nullable) - per-rep override of base
  - Adds `custom_escalation_percentage` (numeric, nullable) - per-rep override of escalation
  - Adds `current_annual_quota` (numeric) - cached active quota
  - Adds `quota_last_calculated_at` (timestamptz) - audit timestamp

  ## New Functions
  - `calculate_sales_quota(user_id, as_of_date)` - returns active quota + per-year breakdown
  - `recalculate_sales_quota_for_user(user_id)` - updates cached current_annual_quota
  - `recalculate_all_sales_quotas()` - refreshes every active rep

  ## Triggers
  - Recalculates a rep's cached quota whenever their yearly_sales_performance changes.

  ## Security
  - No new tables; existing RLS on profiles/organizations/yearly_sales_performance unchanged.
  - All new columns respect existing policies.
*/

-- 1. Organization-level defaults
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='organizations' AND column_name='default_base_annual_quota') THEN
    ALTER TABLE organizations ADD COLUMN default_base_annual_quota numeric(14,2) NOT NULL DEFAULT 500000;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='organizations' AND column_name='default_quota_escalation_percentage') THEN
    ALTER TABLE organizations ADD COLUMN default_quota_escalation_percentage numeric(6,3) NOT NULL DEFAULT 5.000;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='organizations' AND column_name='default_quota_rolling_average_years') THEN
    ALTER TABLE organizations ADD COLUMN default_quota_rolling_average_years integer NOT NULL DEFAULT 3;
  END IF;
END $$;

-- 2. Profile-level quota configuration
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='sales_rep_start_date') THEN
    ALTER TABLE profiles ADD COLUMN sales_rep_start_date date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='quota_mode') THEN
    ALTER TABLE profiles ADD COLUMN quota_mode text NOT NULL DEFAULT 'base_plus_escalation'
      CHECK (quota_mode IN ('base_plus_escalation','custom_plus_escalation'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='custom_base_quota') THEN
    ALTER TABLE profiles ADD COLUMN custom_base_quota numeric(14,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='custom_escalation_percentage') THEN
    ALTER TABLE profiles ADD COLUMN custom_escalation_percentage numeric(6,3);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='current_annual_quota') THEN
    ALTER TABLE profiles ADD COLUMN current_annual_quota numeric(14,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='quota_last_calculated_at') THEN
    ALTER TABLE profiles ADD COLUMN quota_last_calculated_at timestamptz;
  END IF;
END $$;

-- 3. Core calculation function (anniversary-year based)
CREATE OR REPLACE FUNCTION calculate_sales_quota(
  p_user_id uuid,
  p_as_of_date date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile record;
  v_org record;
  v_base_quota numeric;
  v_escalation numeric;
  v_rolling_years integer;
  v_start_date date;
  v_years_elapsed integer;
  v_current_year integer;
  v_year_quota numeric;
  v_prior_quota numeric;
  v_avg_revenue numeric;
  v_revenue_count integer;
  v_breakdown jsonb := '[]'::jsonb;
  v_year_actual numeric;
  v_rule text;
  v_calendar_year integer;
  v_anniversary_start date;
  v_anniversary_end date;
BEGIN
  SELECT p.id, p.sales_rep_start_date, p.quota_mode, p.custom_base_quota,
         p.custom_escalation_percentage, p.created_at, p.organization_id
    INTO v_profile
  FROM profiles p
  WHERE p.id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','profile_not_found');
  END IF;

  SELECT o.default_base_annual_quota, o.default_quota_escalation_percentage,
         o.default_quota_rolling_average_years
    INTO v_org
  FROM organizations o
  WHERE o.id = v_profile.organization_id;

  IF NOT FOUND THEN
    v_org.default_base_annual_quota := 500000;
    v_org.default_quota_escalation_percentage := 5.000;
    v_org.default_quota_rolling_average_years := 3;
  END IF;

  v_start_date := COALESCE(v_profile.sales_rep_start_date, v_profile.created_at::date, p_as_of_date);

  IF v_profile.quota_mode = 'custom_plus_escalation' AND v_profile.custom_base_quota IS NOT NULL THEN
    v_base_quota := v_profile.custom_base_quota;
  ELSE
    v_base_quota := v_org.default_base_annual_quota;
  END IF;

  v_escalation := COALESCE(v_profile.custom_escalation_percentage, v_org.default_quota_escalation_percentage);
  v_rolling_years := GREATEST(1, v_org.default_quota_rolling_average_years);

  v_years_elapsed := GREATEST(0, EXTRACT(YEAR FROM AGE(p_as_of_date, v_start_date))::integer);
  v_current_year := v_years_elapsed + 1;

  v_prior_quota := NULL;

  FOR i IN 1..v_current_year LOOP
    v_anniversary_start := (v_start_date + ((i - 1) || ' years')::interval)::date;
    v_anniversary_end := (v_start_date + (i || ' years')::interval - interval '1 day')::date;
    v_calendar_year := EXTRACT(YEAR FROM v_anniversary_start)::integer;

    IF i = 1 THEN
      v_year_quota := v_base_quota;
      v_rule := 'base';
    ELSIF i <= 3 THEN
      v_year_quota := v_prior_quota * (1 + v_escalation / 100.0);
      v_rule := 'escalation_' || v_escalation::text || '_pct';
    ELSE
      SELECT AVG(total_revenue), COUNT(*)
        INTO v_avg_revenue, v_revenue_count
      FROM yearly_sales_performance
      WHERE user_id = p_user_id
        AND year BETWEEN (v_calendar_year - v_rolling_years) AND (v_calendar_year - 1);

      IF v_revenue_count >= v_rolling_years AND v_avg_revenue IS NOT NULL THEN
        v_year_quota := GREATEST(v_prior_quota * (1 + v_escalation / 100.0), v_avg_revenue);
        IF v_avg_revenue > v_prior_quota * (1 + v_escalation / 100.0) THEN
          v_rule := 'rolling_' || v_rolling_years || 'yr_avg';
        ELSE
          v_rule := 'escalation_' || v_escalation::text || '_pct';
        END IF;
      ELSE
        v_year_quota := v_prior_quota * (1 + v_escalation / 100.0);
        v_rule := 'escalation_' || v_escalation::text || '_pct_fallback';
      END IF;
    END IF;

    SELECT total_revenue INTO v_year_actual
    FROM yearly_sales_performance
    WHERE user_id = p_user_id AND year = v_calendar_year
    LIMIT 1;

    v_breakdown := v_breakdown || jsonb_build_object(
      'year_number', i,
      'calendar_year', v_calendar_year,
      'window_start', v_anniversary_start,
      'window_end', v_anniversary_end,
      'quota', ROUND(v_year_quota, 2),
      'actual_revenue', COALESCE(v_year_actual, 0),
      'rule', v_rule
    );

    v_prior_quota := v_year_quota;
  END LOOP;

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'start_date', v_start_date,
    'as_of_date', p_as_of_date,
    'current_year_number', v_current_year,
    'current_annual_quota', ROUND(v_year_quota, 2),
    'current_monthly_quota', ROUND(v_year_quota / 12.0, 2),
    'quota_mode', v_profile.quota_mode,
    'base_quota_used', v_base_quota,
    'escalation_percentage', v_escalation,
    'rolling_average_years', v_rolling_years,
    'breakdown', v_breakdown
  );
END;
$$;

-- 4. Update cached value for a single rep
CREATE OR REPLACE FUNCTION recalculate_sales_quota_for_user(p_user_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_quota numeric;
BEGIN
  v_result := calculate_sales_quota(p_user_id, CURRENT_DATE);
  v_quota := (v_result->>'current_annual_quota')::numeric;

  UPDATE profiles
     SET current_annual_quota = v_quota,
         quota_last_calculated_at = now()
   WHERE id = p_user_id;

  RETURN v_quota;
END;
$$;

-- 5. Refresh every active sales rep
CREATE OR REPLACE FUNCTION recalculate_all_sales_quotas()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  r record;
BEGIN
  FOR r IN
    SELECT id FROM profiles
    WHERE is_active = true
      AND role IN ('sales','admin','manager','sales_manager')
  LOOP
    PERFORM recalculate_sales_quota_for_user(r.id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- 6. Trigger: recalc when history changes
CREATE OR REPLACE FUNCTION trg_recalc_quota_on_history_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM recalculate_sales_quota_for_user(COALESCE(NEW.user_id, OLD.user_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS recalc_quota_after_history_change ON yearly_sales_performance;
CREATE TRIGGER recalc_quota_after_history_change
AFTER INSERT OR UPDATE OR DELETE ON yearly_sales_performance
FOR EACH ROW EXECUTE FUNCTION trg_recalc_quota_on_history_change();

-- 7. Trigger: recalc when profile quota settings change
CREATE OR REPLACE FUNCTION trg_recalc_quota_on_profile_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.sales_rep_start_date IS DISTINCT FROM OLD.sales_rep_start_date)
     OR (NEW.quota_mode IS DISTINCT FROM OLD.quota_mode)
     OR (NEW.custom_base_quota IS DISTINCT FROM OLD.custom_base_quota)
     OR (NEW.custom_escalation_percentage IS DISTINCT FROM OLD.custom_escalation_percentage) THEN
    PERFORM recalculate_sales_quota_for_user(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recalc_quota_after_profile_change ON profiles;
CREATE TRIGGER recalc_quota_after_profile_change
AFTER UPDATE ON profiles
FOR EACH ROW EXECUTE FUNCTION trg_recalc_quota_on_profile_change();

-- 8. Initial backfill for active sales reps
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT id, created_at, sales_target_start_date
    FROM profiles
    WHERE is_active = true
      AND role IN ('sales','admin','manager','sales_manager')
  LOOP
    UPDATE profiles
       SET sales_rep_start_date = COALESCE(sales_rep_start_date, r.sales_target_start_date::date, r.created_at::date)
     WHERE id = r.id AND sales_rep_start_date IS NULL;

    PERFORM recalculate_sales_quota_for_user(r.id);
  END LOOP;
END $$;
