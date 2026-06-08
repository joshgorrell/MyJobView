-- Replace calculate_sales_quota with pure compound growth model.
-- Formula: quota = base * (1 + rate/100)^(year - 1) for all years.
-- Removes rolling-average override so the model is predictable and transparent.

DROP FUNCTION IF EXISTS calculate_sales_quota(uuid, date);

CREATE FUNCTION calculate_sales_quota(p_user_id uuid, p_as_of_date date)
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
  v_start_date date;
  v_years_elapsed integer;
  v_current_year integer;
  v_year_quota numeric;
  v_breakdown jsonb := '[]'::jsonb;
  v_year_actual numeric;
  v_anniversary_start date;
  v_anniversary_end date;
  v_calendar_year integer;
  i integer;
BEGIN
  SELECT p.id, p.sales_rep_start_date, p.quota_mode, p.custom_base_quota,
         p.custom_escalation_percentage, p.created_at, p.organization_id
  INTO v_profile
  FROM profiles p
  WHERE p.id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'profile_not_found');
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

  v_years_elapsed := GREATEST(0, EXTRACT(YEAR FROM AGE(p_as_of_date, v_start_date))::integer);
  v_current_year := v_years_elapsed + 1;

  FOR i IN 1..v_current_year LOOP
    v_anniversary_start := (v_start_date + ((i - 1) || ' years')::interval)::date;
    v_anniversary_end   := (v_start_date + (i || ' years')::interval - interval '1 day')::date;
    v_calendar_year     := EXTRACT(YEAR FROM v_anniversary_start)::integer;

    v_year_quota := ROUND(v_base_quota * POWER(1.0 + v_escalation / 100.0, i - 1), 2);

    SELECT total_revenue INTO v_year_actual
    FROM yearly_sales_performance
    WHERE user_id = p_user_id AND year = v_calendar_year
    LIMIT 1;

    v_breakdown := v_breakdown || jsonb_build_object(
      'year_number',    i,
      'calendar_year',  v_calendar_year,
      'window_start',   v_anniversary_start,
      'window_end',     v_anniversary_end,
      'quota',          v_year_quota,
      'actual_revenue', COALESCE(v_year_actual, 0),
      'rule',           CASE WHEN i = 1 THEN 'base' ELSE 'compound_growth' END
    );
  END LOOP;

  RETURN jsonb_build_object(
    'user_id',               p_user_id,
    'start_date',            v_start_date,
    'as_of_date',            p_as_of_date,
    'current_year_number',   v_current_year,
    'current_annual_quota',  v_year_quota,
    'current_monthly_quota', ROUND(v_year_quota / 12.0, 2),
    'quota_mode',            v_profile.quota_mode,
    'base_quota_used',       v_base_quota,
    'escalation_percentage', v_escalation,
    'rolling_average_years', COALESCE(v_org.default_quota_rolling_average_years, 3),
    'breakdown',             v_breakdown
  );
END;
$$;

SELECT recalculate_all_sales_quotas();
