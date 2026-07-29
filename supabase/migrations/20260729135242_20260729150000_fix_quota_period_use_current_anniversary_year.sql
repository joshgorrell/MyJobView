/*
# Fix quota period calculation in get_sales_rep_dashboard

Bug: The RPC used the raw sales_rep_start_date as the quota period start.
For reps with early start dates (e.g. Aaron Koker started 2014-01-01),
this meant the quota period was 2014-01-01 to 2014-12-31 — year 1 —
instead of the CURRENT anniversary year (2026-01-01 to 2026-12-31 — year 13).

Fix: Compute the current anniversary window the same way calculate_sales_quota does:
  years_elapsed = GREATEST(0, EXTRACT(YEAR FROM AGE(p_date_reference, start_date)))
  current window start = start_date + (years_elapsed years)
  current window end   = start_date + (years_elapsed + 1 years) - 1 day
*/

CREATE OR REPLACE FUNCTION get_sales_rep_dashboard(
  p_target_rep_id uuid,
  p_date_reference date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_caller_org uuid;
  v_target_org uuid;
  v_profile record;
  v_quota_info jsonb;
  v_annual_quota numeric;
  v_monthly_quota numeric;
  v_raw_start_date date;
  v_years_elapsed int;
  v_quota_start_date date;
  v_quota_end_date date;
  v_quota_elapsed_pct numeric;
  v_booked_sales numeric := 0;
  v_booked_count int := 0;
  v_prev_booked_sales numeric := 0;
  v_prev_booked_count int := 0;
  v_pipeline_total numeric := 0;
  v_pipeline_count int := 0;
  v_won_count int := 0;
  v_lost_count int := 0;
  v_close_rate numeric := 0;
  v_prev_won_count int := 0;
  v_prev_lost_count int := 0;
  v_prev_close_rate numeric := 0;
  v_monthly_trend jsonb := '[]'::jsonb;
  v_avg_sale numeric := 0;
  v_run_rate_90 numeric := 0;
  v_month_start timestamptz;
  v_row record;
  v_current_year int;
  v_current_month int;
  v_prev_year int;
  v_stats_total numeric;
  v_stats_count int;
  v_so_total numeric;
  v_so_count int;
  v_month_total numeric;
  v_month_count int;
  v_prev_year_total numeric;
  v_ytd_total numeric := 0;
  v_ytd_count int := 0;
  v_all_time_total numeric := 0;
  v_quota_start_year int;
  v_quota_end_year int;
  v_quota_start_month int;
  v_quota_end_month int;
  v_prev_quota_start_date date;
  v_prev_quota_end_date date;
BEGIN
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  IF p_target_rep_id != v_caller_id THEN
    IF NOT is_manager_or_admin(v_caller_id) THEN
      RETURN jsonb_build_object('error', 'unauthorized');
    END IF;
    v_caller_org := get_caller_org_id(v_caller_id);
    SELECT organization_id INTO v_target_org FROM profiles WHERE id = p_target_rep_id;
    IF v_target_org IS NULL OR v_target_org != v_caller_org THEN
      RETURN jsonb_build_object('error', 'unauthorized');
    END IF;
  END IF;

  SELECT id, first_name, last_name, full_name, organization_id,
         current_annual_quota, monthly_sales_target, sales_rep_start_date, created_at
  INTO v_profile
  FROM profiles WHERE id = p_target_rep_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'rep_not_found');
  END IF;

  SELECT * FROM calculate_sales_quota(p_target_rep_id, p_date_reference) INTO v_quota_info;
  v_annual_quota := COALESCE((v_quota_info->>'current_annual_quota')::numeric, 0);
  v_monthly_quota := COALESCE((v_quota_info->>'current_monthly_quota')::numeric, 0);

  -- Compute the CURRENT anniversary year window (not year 1)
  v_raw_start_date := COALESCE(v_profile.sales_rep_start_date, v_profile.created_at::date, p_date_reference);
  v_years_elapsed := GREATEST(0, EXTRACT(YEAR FROM AGE(p_date_reference, v_raw_start_date))::int);
  v_quota_start_date := (v_raw_start_date + (v_years_elapsed || ' years')::interval)::date;
  v_quota_end_date := (v_raw_start_date + ((v_years_elapsed + 1) || ' years')::interval - INTERVAL '1 day')::date;

  -- Previous period (same window, one year earlier)
  v_prev_quota_start_date := (v_raw_start_date + ((v_years_elapsed - 1) || ' years')::interval)::date;
  v_prev_quota_end_date := (v_raw_start_date + (v_years_elapsed || ' years')::interval - INTERVAL '1 day')::date;

  IF v_quota_end_date > v_quota_start_date THEN
    v_quota_elapsed_pct := LEAST(100, ROUND(
      (EXTRACT(EPOCH FROM (p_date_reference::timestamp - v_quota_start_date::timestamp)) /
       EXTRACT(EPOCH FROM (v_quota_end_date::timestamp - v_quota_start_date::timestamp)) * 100)::numeric, 1
    ));
  ELSE
    v_quota_elapsed_pct := 100;
  END IF;

  v_current_year := EXTRACT(YEAR FROM p_date_reference)::int;
  v_current_month := EXTRACT(MONTH FROM p_date_reference)::int;
  v_prev_year := v_current_year - 1;

  v_quota_start_year := EXTRACT(YEAR FROM v_quota_start_date)::int;
  v_quota_end_year := EXTRACT(YEAR FROM v_quota_end_date)::int;
  v_quota_start_month := EXTRACT(MONTH FROM v_quota_start_date)::int;
  v_quota_end_month := EXTRACT(MONTH FROM v_quota_end_date)::int;

  -- ── Booked sales for current quota period ───────────────────────
  -- Priority: yearly_sales_performance (full years) + sales_monthly_stats (partial years) + sales_orders (fallback)
  -- Full years within the quota period from yearly_sales_performance
  SELECT COALESCE(SUM(total_revenue), 0)
  INTO v_stats_total
  FROM yearly_sales_performance
  WHERE user_id = p_target_rep_id
    AND year > v_quota_start_year
    AND year < v_quota_end_year;

  -- Partial start year from monthly_stats
  SELECT COALESCE(SUM(total_sales), 0), COALESCE(SUM(sales_order_count), 0)
  INTO v_so_total, v_so_count
  FROM sales_monthly_stats
  WHERE user_id = p_target_rep_id
    AND year = v_quota_start_year
    AND month >= v_quota_start_month;

  v_stats_total := v_stats_total + v_so_total;
  v_stats_count := v_so_count;

  -- Full years between start and end from monthly_stats (if not in yearly)
  IF v_quota_end_year > v_quota_start_year + 1 THEN
    SELECT COALESCE(SUM(sms.total_sales), 0), COALESCE(SUM(sms.sales_order_count), 0)
    INTO v_so_total, v_so_count
    FROM sales_monthly_stats sms
    WHERE sms.user_id = p_target_rep_id
      AND sms.year > v_quota_start_year AND sms.year < v_quota_end_year
      AND NOT EXISTS (
        SELECT 1 FROM yearly_sales_performance ysp
        WHERE ysp.user_id = p_target_rep_id AND ysp.year = sms.year
      );
    v_stats_total := v_stats_total + v_so_total;
    v_stats_count := v_stats_count + v_so_count;
  END IF;

  -- Partial end year from monthly_stats
  IF v_quota_end_year != v_quota_start_year THEN
    SELECT COALESCE(SUM(total_sales), 0), COALESCE(SUM(sales_order_count), 0)
    INTO v_so_total, v_so_count
    FROM sales_monthly_stats
    WHERE user_id = p_target_rep_id
      AND year = v_quota_end_year
      AND month <= v_quota_end_month;
    v_stats_total := v_stats_total + v_so_total;
    v_stats_count := v_stats_count + v_so_count;
  END IF;

  -- Sales orders fallback (for months not covered by monthly_stats)
  SELECT COALESCE(SUM(contract_total), 0), COUNT(*)
  INTO v_so_total, v_so_count
  FROM sales_orders
  WHERE (CASE WHEN sales_rep_id IS NOT NULL THEN sales_rep_id ELSE created_by END) = p_target_rep_id
    AND COALESCE(booked_at, created_at) >= v_quota_start_date::timestamptz
    AND COALESCE(booked_at, created_at) <= v_quota_end_date::timestamptz
    AND status NOT IN ('cancelled', 'voided')
    AND NOT EXISTS (
      SELECT 1 FROM sales_monthly_stats sms
      WHERE sms.user_id = p_target_rep_id
        AND sms.year = EXTRACT(YEAR FROM COALESCE(sales_orders.booked_at, sales_orders.created_at))::int
        AND sms.month = EXTRACT(MONTH FROM COALESCE(sales_orders.booked_at, sales_orders.created_at))::int
    );

  v_booked_sales := COALESCE(v_stats_total, 0) + COALESCE(v_so_total, 0);
  v_booked_count := COALESCE(v_stats_count, 0) + COALESCE(v_so_count, 0);

  -- ── Previous period ─────────────────────────────────────────────
  v_stats_total := 0;
  v_stats_count := 0;

  SELECT COALESCE(SUM(total_revenue), 0)
  INTO v_stats_total
  FROM yearly_sales_performance
  WHERE user_id = p_target_rep_id
    AND year > EXTRACT(YEAR FROM v_prev_quota_start_date)::int
    AND year < EXTRACT(YEAR FROM v_prev_quota_end_date)::int;

  SELECT COALESCE(SUM(total_sales), 0), COALESCE(SUM(sales_order_count), 0)
  INTO v_so_total, v_so_count
  FROM sales_monthly_stats
  WHERE user_id = p_target_rep_id
    AND year = EXTRACT(YEAR FROM v_prev_quota_start_date)::int
    AND month >= EXTRACT(MONTH FROM v_prev_quota_start_date)::int;
  v_stats_total := v_stats_total + v_so_total;
  v_stats_count := v_stats_count + v_so_count;

  IF EXTRACT(YEAR FROM v_prev_quota_end_date)::int != EXTRACT(YEAR FROM v_prev_quota_start_date)::int THEN
    SELECT COALESCE(SUM(total_sales), 0), COALESCE(SUM(sales_order_count), 0)
    INTO v_so_total, v_so_count
    FROM sales_monthly_stats
    WHERE user_id = p_target_rep_id
      AND year = EXTRACT(YEAR FROM v_prev_quota_end_date)::int
      AND month <= EXTRACT(MONTH FROM v_prev_quota_end_date)::int;
    v_stats_total := v_stats_total + v_so_total;
    v_stats_count := v_stats_count + v_so_count;
  END IF;

  SELECT COALESCE(SUM(contract_total), 0), COUNT(*)
  INTO v_so_total, v_so_count
  FROM sales_orders
  WHERE (CASE WHEN sales_rep_id IS NOT NULL THEN sales_rep_id ELSE created_by END) = p_target_rep_id
    AND COALESCE(booked_at, created_at) >= v_prev_quota_start_date::timestamptz
    AND COALESCE(booked_at, created_at) <= v_prev_quota_end_date::timestamptz
    AND status NOT IN ('cancelled', 'voided')
    AND NOT EXISTS (
      SELECT 1 FROM sales_monthly_stats sms
      WHERE sms.user_id = p_target_rep_id
        AND sms.year = EXTRACT(YEAR FROM COALESCE(sales_orders.booked_at, sales_orders.created_at))::int
        AND sms.month = EXTRACT(MONTH FROM COALESCE(sales_orders.booked_at, sales_orders.created_at))::int
    );

  v_prev_booked_sales := COALESCE(v_stats_total, 0) + COALESCE(v_so_total, 0);
  v_prev_booked_count := COALESCE(v_stats_count, 0) + COALESCE(v_so_count, 0);

  v_avg_sale := CASE WHEN v_booked_count > 0 THEN v_booked_sales / v_booked_count ELSE 0 END;

  -- ── All-time total ───────────────────────────────────────────────
  SELECT COALESCE(SUM(total_revenue), 0) INTO v_all_time_total
  FROM yearly_sales_performance
  WHERE user_id = p_target_rep_id;

  SELECT COALESCE(SUM(contract_total), 0)
  INTO v_so_total
  FROM sales_orders
  WHERE (CASE WHEN sales_rep_id IS NOT NULL THEN sales_rep_id ELSE created_by END) = p_target_rep_id
    AND status NOT IN ('cancelled', 'voided')
    AND EXTRACT(YEAR FROM COALESCE(booked_at, created_at))::int NOT IN (
      SELECT year FROM yearly_sales_performance WHERE user_id = p_target_rep_id
    );
  v_all_time_total := v_all_time_total + COALESCE(v_so_total, 0);

  -- ── Pipeline ─────────────────────────────────────────────────────
  SELECT COALESCE(SUM(total), 0), COUNT(*)
  INTO v_pipeline_total, v_pipeline_count
  FROM proposals
  WHERE created_by = p_target_rep_id
    AND status IN ('designing', 'ready_to_submit', 'sent', 'portal');

  -- ── Close rate ───────────────────────────────────────────────────
  SELECT COUNT(*) INTO v_won_count
  FROM proposals
  WHERE created_by = p_target_rep_id
    AND status IN ('approved', 'approved_pending_action')
    AND COALESCE(approved_at, created_at) >= v_quota_start_date::timestamptz
    AND COALESCE(approved_at, created_at) <= v_quota_end_date::timestamptz;

  SELECT COUNT(*) INTO v_lost_count
  FROM proposals
  WHERE created_by = p_target_rep_id
    AND status IN ('declined', 'cancelled', 'expired')
    AND COALESCE(
      CASE WHEN status = 'declined' THEN declined_at END,
      CASE WHEN status = 'expired' THEN valid_until::timestamptz END,
      created_at
    ) >= v_quota_start_date::timestamptz
    AND COALESCE(
      CASE WHEN status = 'declined' THEN declined_at END,
      CASE WHEN status = 'expired' THEN valid_until::timestamptz END,
      created_at
    ) <= v_quota_end_date::timestamptz;

  IF (v_won_count + v_lost_count) > 0 THEN
    v_close_rate := ROUND((v_won_count::numeric / (v_won_count + v_lost_count)) * 100, 1);
  END IF;

  SELECT COUNT(*) INTO v_prev_won_count
  FROM proposals
  WHERE created_by = p_target_rep_id
    AND status IN ('approved', 'approved_pending_action')
    AND COALESCE(approved_at, created_at) >= v_prev_quota_start_date::timestamptz
    AND COALESCE(approved_at, created_at) <= v_prev_quota_end_date::timestamptz;

  SELECT COUNT(*) INTO v_prev_lost_count
  FROM proposals
  WHERE created_by = p_target_rep_id
    AND status IN ('declined', 'cancelled', 'expired')
    AND COALESCE(
      CASE WHEN status = 'declined' THEN declined_at END,
      CASE WHEN status = 'expired' THEN valid_until::timestamptz END,
      created_at
    ) >= v_prev_quota_start_date::timestamptz
    AND COALESCE(
      CASE WHEN status = 'declined' THEN declined_at END,
      CASE WHEN status = 'expired' THEN valid_until::timestamptz END,
      created_at
    ) <= v_prev_quota_end_date::timestamptz;

  IF (v_prev_won_count + v_prev_lost_count) > 0 THEN
    v_prev_close_rate := ROUND((v_prev_won_count::numeric / (v_prev_won_count + v_prev_lost_count)) * 100, 1);
  END IF;

  -- ── Monthly trend (12 months) ────────────────────────────────────
  v_month_start := date_trunc('month', p_date_reference::timestamptz);
  FOR i IN 0..11 LOOP
    v_month_total := 0;
    v_month_count := 0;

    SELECT COALESCE(SUM(total_sales), 0), COALESCE(SUM(sales_order_count), 0)
    INTO v_stats_total, v_stats_count
    FROM sales_monthly_stats
    WHERE user_id = p_target_rep_id
      AND year = EXTRACT(YEAR FROM (v_month_start - (i || ' months')::interval))::int
      AND month = EXTRACT(MONTH FROM (v_month_start - (i || ' months')::interval))::int;

    IF COALESCE(v_stats_total, 0) > 0 THEN
      v_month_total := v_stats_total;
      v_month_count := v_stats_count;
    ELSE
      SELECT COALESCE(SUM(contract_total), 0), COUNT(*)
      INTO v_so_total, v_so_count
      FROM sales_orders
      WHERE (CASE WHEN sales_rep_id IS NOT NULL THEN sales_rep_id ELSE created_by END) = p_target_rep_id
        AND COALESCE(booked_at, created_at) >= (v_month_start - (i || ' months')::interval)
        AND COALESCE(booked_at, created_at) < (v_month_start - ((i - 1) || ' months')::interval)
        AND status NOT IN ('cancelled', 'voided');
      v_month_total := v_so_total;
      v_month_count := v_so_count;
    END IF;

    v_monthly_trend := v_monthly_trend || jsonb_build_object(
      'month', to_char((v_month_start - (i || ' months')::interval)::date, 'YYYY-MM'),
      'total', v_month_total,
      'count', v_month_count
    );
  END LOOP;

  -- ── 90-day run rate (annualized) ────────────────────────────────
  SELECT COALESCE(SUM(total_sales), 0)
  INTO v_stats_total
  FROM sales_monthly_stats
  WHERE user_id = p_target_rep_id
    AND year = v_current_year
    AND month >= GREATEST(1, v_current_month - 2)
    AND month <= v_current_month;

  -- Add previous year months if we're in Jan/Feb
  IF v_current_month <= 2 THEN
    SELECT COALESCE(SUM(total_sales), 0)
    INTO v_so_total
    FROM sales_monthly_stats
    WHERE user_id = p_target_rep_id
      AND year = v_current_year - 1
      AND month >= 11 + v_current_month;
    v_stats_total := v_stats_total + v_so_total;
  END IF;

  SELECT COALESCE(SUM(contract_total), 0)
  INTO v_so_total
  FROM sales_orders
  WHERE (CASE WHEN sales_rep_id IS NOT NULL THEN sales_rep_id ELSE created_by END) = p_target_rep_id
    AND COALESCE(booked_at, created_at) >= (p_date_reference::timestamptz - INTERVAL '90 days')
    AND COALESCE(booked_at, created_at) <= p_date_reference::timestamptz
    AND status NOT IN ('cancelled', 'voided')
    AND NOT EXISTS (
      SELECT 1 FROM sales_monthly_stats sms
      WHERE sms.user_id = p_target_rep_id
        AND sms.year = EXTRACT(YEAR FROM COALESCE(sales_orders.booked_at, sales_orders.created_at))::int
        AND sms.month = EXTRACT(MONTH FROM COALESCE(sales_orders.booked_at, sales_orders.created_at))::int
    );

  v_run_rate_90 := COALESCE(v_stats_total, 0) + COALESCE(v_so_total, 0);
  v_run_rate_90 := ROUND((v_run_rate_90 / 90.0) * 365, 2);

  -- ── YTD total ────────────────────────────────────────────────────
  SELECT COALESCE(SUM(total_sales), 0), COALESCE(SUM(sales_order_count), 0)
  INTO v_ytd_total, v_ytd_count
  FROM sales_monthly_stats
  WHERE user_id = p_target_rep_id
    AND year = v_current_year
    AND month <= v_current_month;

  SELECT COALESCE(SUM(contract_total), 0), COUNT(*)
  INTO v_so_total, v_so_count
  FROM sales_orders
  WHERE (CASE WHEN sales_rep_id IS NOT NULL THEN sales_rep_id ELSE created_by END) = p_target_rep_id
    AND COALESCE(booked_at, created_at) >= make_timestamptz(v_current_year, 1, 1, 0, 0, 0)
    AND COALESCE(booked_at, created_at) <= p_date_reference::timestamptz
    AND status NOT IN ('cancelled', 'voided')
    AND NOT EXISTS (
      SELECT 1 FROM sales_monthly_stats sms
      WHERE sms.user_id = p_target_rep_id
        AND sms.year = EXTRACT(YEAR FROM COALESCE(sales_orders.booked_at, sales_orders.created_at))::int
        AND sms.month = EXTRACT(MONTH FROM COALESCE(sales_orders.booked_at, sales_orders.created_at))::int
    );

  v_ytd_total := v_ytd_total + COALESCE(v_so_total, 0);
  v_ytd_count := v_ytd_count + COALESCE(v_so_count, 0);

  -- ── Previous year total ───────────────────────────────────────────
  SELECT COALESCE(SUM(total_revenue), 0) INTO v_prev_year_total
  FROM yearly_sales_performance
  WHERE user_id = p_target_rep_id AND year = v_prev_year;

  IF v_prev_year_total = 0 THEN
    SELECT COALESCE(SUM(total_sales), 0) INTO v_prev_year_total
    FROM sales_monthly_stats
    WHERE user_id = p_target_rep_id AND year = v_prev_year;
  END IF;

  RETURN jsonb_build_object(
    'repId', p_target_rep_id,
    'repDisplayName', COALESCE(
      CASE WHEN v_profile.first_name IS NOT NULL AND v_profile.last_name IS NOT NULL
           THEN v_profile.first_name || ' ' || v_profile.last_name END,
      v_profile.full_name,
      'Unknown'
    ),
    'quota', jsonb_build_object(
      'annualQuota', v_annual_quota,
      'monthlyQuota', v_monthly_quota,
      'quotaStartDate', v_quota_start_date,
      'quotaEndDate', v_quota_end_date,
      'quotaElapsedPct', v_quota_elapsed_pct,
      'hasQuota', v_annual_quota > 0
    ),
    'bookedSales', jsonb_build_object(
      'total', v_booked_sales,
      'count', v_booked_count,
      'avgSale', v_avg_sale,
      'prevTotal', v_prev_booked_sales,
      'prevCount', v_prev_booked_count
    ),
    'pipeline', jsonb_build_object(
      'total', v_pipeline_total,
      'count', v_pipeline_count
    ),
    'closeRate', jsonb_build_object(
      'pct', v_close_rate,
      'wonCount', v_won_count,
      'lostCount', v_lost_count,
      'prevPct', v_prev_close_rate,
      'prevWonCount', v_prev_won_count,
      'prevLostCount', v_prev_lost_count
    ),
    'runRate90Day', v_run_rate_90,
    'monthlyTrend', v_monthly_trend,
    'ytdTotal', v_ytd_total,
    'ytdCount', v_ytd_count,
    'prevYearTotal', v_prev_year_total,
    'allTimeTotal', v_all_time_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_sales_rep_dashboard(uuid, date) TO authenticated;
