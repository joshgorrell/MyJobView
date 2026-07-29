/*
# Update Sales Dashboard RPCs to Include Historical Data

The original RPCs only queried sales_orders (1 row) and proposals.
The uploaded historical data lives in:
  - sales_monthly_stats (143 rows, 2020-2026) — source of truth for booked revenue
  - yearly_sales_performance (19 rows) — year-over-year comparisons

This migration rewrites get_sales_rep_dashboard and get_sales_goal_leaderboard
to merge all three data sources with this priority:
  1. sales_monthly_stats (primary — includes manually-entered + calculated totals)
  2. sales_orders (fallback for months not in monthly_stats)
  3. proposals (last resort)

No data is moved or deleted. The historical tables remain the source of truth.
*/

-- ── Updated get_sales_rep_dashboard ─────────────────────────────────
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
  v_prev_year_count int;
  v_ytd_total numeric := 0;
  v_ytd_count int := 0;
  v_prev_period_year int;
  v_prev_period_total numeric := 0;
  v_prev_period_count int := 0;
  v_all_time_total numeric := 0;
BEGIN
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  -- Authorization: self OR manager/admin in same org
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

  -- Get profile
  SELECT id, first_name, last_name, full_name, organization_id,
         current_annual_quota, monthly_sales_target, sales_rep_start_date
  INTO v_profile
  FROM profiles WHERE id = p_target_rep_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'rep_not_found');
  END IF;

  -- Quota info
  SELECT * FROM calculate_sales_quota(p_target_rep_id, p_date_reference) INTO v_quota_info;
  v_annual_quota := COALESCE((v_quota_info->>'current_annual_quota')::numeric, 0);
  v_monthly_quota := COALESCE((v_quota_info->>'current_monthly_quota')::numeric, 0);

  v_quota_start_date := COALESCE(v_profile.sales_rep_start_date, (v_quota_info->>'start_date')::date, p_date_reference);
  v_quota_end_date := (v_quota_start_date + INTERVAL '1 year' - INTERVAL '1 day')::date;

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

  -- ── Booked sales for current quota period ───────────────────────
  -- Priority: sales_monthly_stats (source of truth) → sales_orders fallback
  -- Sum monthly_stats for months within quota period
  SELECT COALESCE(SUM(total_sales), 0), COALESCE(SUM(sales_order_count), 0)
  INTO v_stats_total, v_stats_count
  FROM sales_monthly_stats
  WHERE user_id = p_target_rep_id
    AND (
      (year = EXTRACT(YEAR FROM v_quota_start_date)::int AND month >= EXTRACT(MONTH FROM v_quota_start_date)::int)
      OR
      (year > EXTRACT(YEAR FROM v_quota_start_date)::int AND year < EXTRACT(YEAR FROM v_quota_end_date)::int)
      OR
      (year = EXTRACT(YEAR FROM v_quota_end_date)::int AND month <= EXTRACT(MONTH FROM v_quota_end_date)::int)
    );

  -- Sum sales_orders for the quota period (for months NOT already covered by monthly_stats)
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

  -- ── Previous period (same quota window, one year prior) ─────────
  SELECT COALESCE(SUM(total_sales), 0), COALESCE(SUM(sales_order_count), 0)
  INTO v_stats_total, v_stats_count
  FROM sales_monthly_stats
  WHERE user_id = p_target_rep_id
    AND (
      (year = EXTRACT(YEAR FROM (v_quota_start_date - INTERVAL '1 year'))::int AND month >= EXTRACT(MONTH FROM (v_quota_start_date - INTERVAL '1 year'))::int)
      OR
      (year > EXTRACT(YEAR FROM (v_quota_start_date - INTERVAL '1 year'))::int AND year < EXTRACT(YEAR FROM (v_quota_end_date - INTERVAL '1 year'))::int)
      OR
      (year = EXTRACT(YEAR FROM (v_quota_end_date - INTERVAL '1 year'))::int AND month <= EXTRACT(MONTH FROM (v_quota_end_date - INTERVAL '1 year'))::int)
    );

  SELECT COALESCE(SUM(contract_total), 0), COUNT(*)
  INTO v_so_total, v_so_count
  FROM sales_orders
  WHERE (CASE WHEN sales_rep_id IS NOT NULL THEN sales_rep_id ELSE created_by END) = p_target_rep_id
    AND COALESCE(booked_at, created_at) >= (v_quota_start_date - INTERVAL '1 year')::timestamptz
    AND COALESCE(booked_at, created_at) <= (v_quota_end_date - INTERVAL '1 year')::timestamptz
    AND status NOT IN ('cancelled', 'voided')
    AND NOT EXISTS (
      SELECT 1 FROM sales_monthly_stats sms
      WHERE sms.user_id = p_target_rep_id
        AND sms.year = EXTRACT(YEAR FROM COALESCE(sales_orders.booked_at, sales_orders.created_at))::int
        AND sms.month = EXTRACT(MONTH FROM COALESCE(sales_orders.booked_at, sales_orders.created_at))::int
    );

  v_prev_booked_sales := COALESCE(v_stats_total, 0) + COALESCE(v_so_total, 0);
  v_prev_booked_count := COALESCE(v_stats_count, 0) + COALESCE(v_so_count, 0);

  -- Average sale
  v_avg_sale := CASE WHEN v_booked_count > 0 THEN v_booked_sales / v_booked_count ELSE 0 END;

  -- ── All-time total (for career context) ──────────────────────────
  SELECT COALESCE(SUM(total_revenue), 0) INTO v_all_time_total
  FROM yearly_sales_performance
  WHERE user_id = p_target_rep_id;

  -- Add sales_orders total for current year not covered by yearly_sales_performance
  SELECT COALESCE(SUM(contract_total), 0)
  INTO v_so_total
  FROM sales_orders
  WHERE (CASE WHEN sales_rep_id IS NOT NULL THEN sales_rep_id ELSE created_by END) = p_target_rep_id
    AND status NOT IN ('cancelled', 'voided')
    AND EXTRACT(YEAR FROM COALESCE(booked_at, created_at))::int NOT IN (
      SELECT year FROM yearly_sales_performance WHERE user_id = p_target_rep_id
    );

  v_all_time_total := v_all_time_total + COALESCE(v_so_total, 0);

  -- ── Pipeline (qualified statuses) ────────────────────────────────
  SELECT COALESCE(SUM(total), 0), COUNT(*)
  INTO v_pipeline_total, v_pipeline_count
  FROM proposals
  WHERE created_by = p_target_rep_id
    AND status IN ('designing', 'ready_to_submit', 'sent', 'portal');

  -- ── Close rate for current quota period ─────────────────────────
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

  -- Previous period close rate
  SELECT COUNT(*) INTO v_prev_won_count
  FROM proposals
  WHERE created_by = p_target_rep_id
    AND status IN ('approved', 'approved_pending_action')
    AND COALESCE(approved_at, created_at) >= (v_quota_start_date - INTERVAL '1 year')::timestamptz
    AND COALESCE(approved_at, created_at) <= (v_quota_end_date - INTERVAL '1 year')::timestamptz;

  SELECT COUNT(*) INTO v_prev_lost_count
  FROM proposals
  WHERE created_by = p_target_rep_id
    AND status IN ('declined', 'cancelled', 'expired')
    AND COALESCE(
      CASE WHEN status = 'declined' THEN declined_at END,
      CASE WHEN status = 'expired' THEN valid_until::timestamptz END,
      created_at
    ) >= (v_quota_start_date - INTERVAL '1 year')::timestamptz
    AND COALESCE(
      CASE WHEN status = 'declined' THEN declined_at END,
      CASE WHEN status = 'expired' THEN valid_until::timestamptz END,
      created_at
    ) <= (v_quota_end_date - INTERVAL '1 year')::timestamptz;

  IF (v_prev_won_count + v_prev_lost_count) > 0 THEN
    v_prev_close_rate := ROUND((v_prev_won_count::numeric / (v_prev_won_count + v_prev_lost_count)) * 100, 1);
  END IF;

  -- ── Monthly trend (12 months) ────────────────────────────────────
  -- For each month: prefer sales_monthly_stats, fall back to sales_orders
  v_month_start := date_trunc('month', p_date_reference::timestamptz);
  FOR i IN 0..11 LOOP
    v_row := NULL;
    v_month_total := 0;
    v_month_count := 0;

    -- Try monthly_stats first
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
      -- Fallback to sales_orders for this month
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
  -- Use monthly_stats for the last 3 months, plus sales_orders for current partial month
  SELECT COALESCE(SUM(total_sales), 0)
  INTO v_stats_total
  FROM sales_monthly_stats
  WHERE user_id = p_target_rep_id
    AND (
      (year = v_current_year AND month >= v_current_month - 2 AND month <= v_current_month)
      OR
      (year = v_current_year - 1 AND month >= 11 AND v_current_month <= 2)
    );

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

  -- ── YTD total (current calendar year) ────────────────────────────
  SELECT COALESCE(SUM(total_sales), 0), COALESCE(SUM(sales_order_count), 0)
  INTO v_ytd_total, v_ytd_count
  FROM sales_monthly_stats
  WHERE user_id = p_target_rep_id
    AND year = v_current_year
    AND month <= v_current_month;

  -- Add sales_orders YTD not covered by monthly_stats
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

  -- ── Previous year total (full year) ──────────────────────────────
  SELECT COALESCE(SUM(total_revenue), 0) INTO v_prev_year_total
  FROM yearly_sales_performance
  WHERE user_id = p_target_rep_id AND year = v_prev_year;

  IF v_prev_year_total = 0 THEN
    -- Fallback to monthly_stats if yearly not available
    SELECT COALESCE(SUM(total_sales), 0) INTO v_prev_year_total
    FROM sales_monthly_stats
    WHERE user_id = p_target_rep_id AND year = v_prev_year;
  END IF;

  -- Build result
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

-- ── Updated get_sales_goal_leaderboard ──────────────────────────────
-- Now incorporates yearly_sales_performance + sales_monthly_stats for attainment
CREATE OR REPLACE FUNCTION get_sales_goal_leaderboard(p_date_reference date DEFAULT CURRENT_DATE)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_caller_org uuid;
  v_results jsonb := '[]'::jsonb;
  v_row record;
  v_rank int := 0;
  v_quota numeric;
  v_booked numeric;
  v_attainment numeric;
  v_display_name text;
  v_is_current boolean;
  v_prev_booked numeric;
  v_trend text;
  v_current_year int;
  v_quota_start date;
  v_quota_end date;
BEGIN
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  v_caller_org := get_caller_org_id(v_caller_id);
  IF v_caller_org IS NULL THEN
    RETURN jsonb_build_object('error', 'no_organization');
  END IF;

  v_current_year := EXTRACT(YEAR FROM p_date_reference)::int;

  FOR v_row IN
    SELECT p.id, p.first_name, p.last_name, p.full_name,
           COALESCE(p.current_annual_quota, 0) AS quota,
           COALESCE(p.sales_rep_start_date, p.created_at::date) AS q_start,
           -- Booked: yearly_sales_performance for quota year + monthly_stats for current year + sales_orders fallback
           COALESCE((
             SELECT SUM(total_revenue)
             FROM yearly_sales_performance ysp
             WHERE ysp.user_id = p.id
               AND ysp.year = EXTRACT(YEAR FROM COALESCE(p.sales_rep_start_date, p.created_at::date))::int
           ), 0) +
           COALESCE((
             SELECT SUM(sms.total_sales)
             FROM sales_monthly_stats sms
             WHERE sms.user_id = p.id
               AND sms.year = EXTRACT(YEAR FROM COALESCE(p.sales_rep_start_date, p.created_at::date))::int
               AND sms.month >= EXTRACT(MONTH FROM COALESCE(p.sales_rep_start_date, p.created_at::date))::int
               AND NOT EXISTS (
                 SELECT 1 FROM yearly_sales_performance ysp2
                 WHERE ysp2.user_id = p.id AND ysp2.year = sms.year
               )
           ), 0) +
           COALESCE((
             SELECT SUM(sms.total_sales)
             FROM sales_monthly_stats sms
             WHERE sms.user_id = p.id
               AND sms.year > EXTRACT(YEAR FROM COALESCE(p.sales_rep_start_date, p.created_at::date))::int
               AND sms.year < EXTRACT(YEAR FROM (COALESCE(p.sales_rep_start_date, p.created_at::date) + INTERVAL '1 year - 1 day'))::int
           ), 0) +
           COALESCE((
             SELECT SUM(sms.total_sales)
             FROM sales_monthly_stats sms
             WHERE sms.user_id = p.id
               AND sms.year = EXTRACT(YEAR FROM (COALESCE(p.sales_rep_start_date, p.created_at::date) + INTERVAL '1 year - 1 day'))::int
               AND sms.month <= EXTRACT(MONTH FROM (COALESCE(p.sales_rep_start_date, p.created_at::date) + INTERVAL '1 year - 1 day'))::int
           ), 0) +
           COALESCE((
             SELECT SUM(so.contract_total)
             FROM sales_orders so
             WHERE (CASE WHEN so.sales_rep_id IS NOT NULL THEN so.sales_rep_id ELSE so.created_by END) = p.id
               AND COALESCE(so.booked_at, so.created_at) >= COALESCE(p.sales_rep_start_date, p.created_at::date)::timestamptz
               AND COALESCE(so.booked_at, so.created_at) <= (COALESCE(p.sales_rep_start_date, p.created_at::date) + INTERVAL '1 year - 1 day')::timestamptz
               AND so.status NOT IN ('cancelled', 'voided')
               AND NOT EXISTS (
                 SELECT 1 FROM sales_monthly_stats sms3
                 WHERE sms3.user_id = p.id
                   AND sms3.year = EXTRACT(YEAR FROM COALESCE(so.booked_at, so.created_at))::int
                   AND sms3.month = EXTRACT(MONTH FROM COALESCE(so.booked_at, so.created_at))::int
               )
           ), 0) AS booked,
           -- Previous period booked for trend
           COALESCE((
             SELECT SUM(total_revenue)
             FROM yearly_sales_performance ysp
             WHERE ysp.user_id = p.id
               AND ysp.year = EXTRACT(YEAR FROM (COALESCE(p.sales_rep_start_date, p.created_at::date) - INTERVAL '1 year'))::int
           ), 0) +
           COALESCE((
             SELECT SUM(sms.total_sales)
             FROM sales_monthly_stats sms
             WHERE sms.user_id = p.id
               AND sms.year >= EXTRACT(YEAR FROM (COALESCE(p.sales_rep_start_date, p.created_at::date) - INTERVAL '1 year'))::int
               AND sms.year <= EXTRACT(YEAR FROM (COALESCE(p.sales_rep_start_date, p.created_at::date) - INTERVAL '1 day'))::int
               AND NOT EXISTS (
                 SELECT 1 FROM yearly_sales_performance ysp4
                 WHERE ysp4.user_id = p.id AND ysp4.year = sms.year
               )
           ), 0) AS prev_booked
    FROM profiles p
    WHERE p.organization_id = v_caller_org
      AND p.can_create_proposals = true
    ORDER BY booked DESC
  LOOP
    v_rank := v_rank + 1;
    v_quota := v_row.quota;
    v_booked := v_row.booked;
    v_attainment := CASE WHEN v_quota > 0 THEN ROUND((v_booked / v_quota) * 100, 1) ELSE 0 END;
    v_display_name := CASE
      WHEN v_row.first_name IS NOT NULL AND v_row.last_name IS NOT NULL
        THEN v_row.first_name || ' ' || LEFT(v_row.last_name, 1) || '.'
      ELSE COALESCE(v_row.full_name, 'Unknown')
    END;
    v_is_current := (v_row.id = v_caller_id);
    v_prev_booked := v_row.prev_booked;
    v_trend := CASE
      WHEN v_prev_booked = 0 AND v_booked > 0 THEN 'up'
      WHEN v_booked > v_prev_booked THEN 'up'
      WHEN v_booked < v_prev_booked THEN 'down'
      ELSE 'flat'
    END;

    v_results := v_results || jsonb_build_object(
      'rank', v_rank,
      'repDisplayName', v_display_name,
      'attainmentPct', v_attainment,
      'trend', v_trend,
      'isCurrentUser', v_is_current
    );
  END LOOP;

  RETURN jsonb_build_object('leaderboard', v_results, 'currentUserId', v_caller_id);
END;
$$;

-- Re-grant
GRANT EXECUTE ON FUNCTION get_sales_rep_dashboard(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION get_sales_goal_leaderboard(date) TO authenticated;
