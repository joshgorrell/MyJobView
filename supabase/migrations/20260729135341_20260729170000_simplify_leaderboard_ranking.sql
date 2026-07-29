/*
# Simplify leaderboard ranking

The previous version had complex JSON manipulation for ranking.
This version uses a simpler approach: collect into a temp table,
sort, rank, then build the JSON output.
*/

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
  v_raw_start date;
  v_years_elapsed int;
  v_q_start date;
  v_q_end date;
  v_q_start_year int;
  v_q_end_year int;
  v_q_start_month int;
  v_q_end_month int;
  v_prev_q_start date;
  v_prev_q_end date;
BEGIN
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  v_caller_org := get_caller_org_id(v_caller_id);
  IF v_caller_org IS NULL THEN
    RETURN jsonb_build_object('error', 'no_organization');
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _leaderboard_temp (
    rep_id uuid,
    display_name text,
    quota numeric,
    booked numeric,
    prev_booked numeric,
    is_current boolean
  );
  DELETE FROM _leaderboard_temp;

  FOR v_row IN
    SELECT p.id, p.first_name, p.last_name, p.full_name,
           COALESCE(p.current_annual_quota, 0) AS quota,
           COALESCE(p.sales_rep_start_date, p.created_at::date) AS raw_start
    FROM profiles p
    WHERE p.organization_id = v_caller_org
      AND p.can_create_proposals = true
  LOOP
    v_raw_start := COALESCE(v_row.raw_start, p_date_reference);
    v_years_elapsed := GREATEST(0, EXTRACT(YEAR FROM AGE(p_date_reference, v_raw_start))::int);
    v_q_start := (v_raw_start + (v_years_elapsed || ' years')::interval)::date;
    v_q_end := (v_raw_start + ((v_years_elapsed + 1) || ' years')::interval - INTERVAL '1 day')::date;
    v_prev_q_start := (v_raw_start + ((v_years_elapsed - 1) || ' years')::interval)::date;
    v_prev_q_end := (v_raw_start + (v_years_elapsed || ' years')::interval - INTERVAL '1 day')::date;

    v_q_start_year := EXTRACT(YEAR FROM v_q_start)::int;
    v_q_end_year := EXTRACT(YEAR FROM v_q_end)::int;
    v_q_start_month := EXTRACT(MONTH FROM v_q_start)::int;
    v_q_end_month := EXTRACT(MONTH FROM v_q_end)::int;

    v_booked := 0;
    v_prev_booked := 0;

    -- Full years within quota period from yearly_sales_performance
    SELECT COALESCE(SUM(total_revenue), 0) INTO v_booked
    FROM yearly_sales_performance
    WHERE user_id = v_row.id AND year > v_q_start_year AND year < v_q_end_year;

    -- Partial start year from monthly_stats
    SELECT COALESCE(SUM(total_sales), 0) + v_booked INTO v_booked
    FROM sales_monthly_stats
    WHERE user_id = v_row.id AND year = v_q_start_year AND month >= v_q_start_month;

    -- Full years from monthly_stats not in yearly
    IF v_q_end_year > v_q_start_year + 1 THEN
      SELECT COALESCE(SUM(sms.total_sales), 0) + v_booked INTO v_booked
      FROM sales_monthly_stats sms
      WHERE sms.user_id = v_row.id
        AND sms.year > v_q_start_year AND sms.year < v_q_end_year
        AND NOT EXISTS (
          SELECT 1 FROM yearly_sales_performance ysp
          WHERE ysp.user_id = v_row.id AND ysp.year = sms.year
        );
    END IF;

    -- Partial end year
    IF v_q_end_year != v_q_start_year THEN
      SELECT COALESCE(SUM(total_sales), 0) + v_booked INTO v_booked
      FROM sales_monthly_stats
      WHERE user_id = v_row.id AND year = v_q_end_year AND month <= v_q_end_month;
    END IF;

    -- Sales orders fallback
    SELECT COALESCE(SUM(contract_total), 0) + v_booked INTO v_booked
    FROM sales_orders so
    WHERE (CASE WHEN so.sales_rep_id IS NOT NULL THEN so.sales_rep_id ELSE so.created_by END) = v_row.id
      AND COALESCE(so.booked_at, so.created_at) >= v_q_start::timestamptz
      AND COALESCE(so.booked_at, so.created_at) <= v_q_end::timestamptz
      AND so.status NOT IN ('cancelled', 'voided')
      AND NOT EXISTS (
        SELECT 1 FROM sales_monthly_stats sms3
        WHERE sms3.user_id = v_row.id
          AND sms3.year = EXTRACT(YEAR FROM COALESCE(so.booked_at, so.created_at))::int
          AND sms3.month = EXTRACT(MONTH FROM COALESCE(so.booked_at, so.created_at))::int
      );

    -- Previous period
    SELECT COALESCE(SUM(total_revenue), 0) INTO v_prev_booked
    FROM yearly_sales_performance
    WHERE user_id = v_row.id
      AND year > EXTRACT(YEAR FROM v_prev_q_start)::int
      AND year < EXTRACT(YEAR FROM v_prev_q_end)::int;

    SELECT COALESCE(SUM(total_sales), 0) + v_prev_booked INTO v_prev_booked
    FROM sales_monthly_stats
    WHERE user_id = v_row.id
      AND year = EXTRACT(YEAR FROM v_prev_q_start)::int
      AND month >= EXTRACT(MONTH FROM v_prev_q_start)::int;

    IF EXTRACT(YEAR FROM v_prev_q_end)::int != EXTRACT(YEAR FROM v_prev_q_start)::int THEN
      SELECT COALESCE(SUM(total_sales), 0) + v_prev_booked INTO v_prev_booked
      FROM sales_monthly_stats
      WHERE user_id = v_row.id
        AND year = EXTRACT(YEAR FROM v_prev_q_end)::int
        AND month <= EXTRACT(MONTH FROM v_prev_q_end)::int;
    END IF;

    v_display_name := CASE
      WHEN v_row.first_name IS NOT NULL AND v_row.last_name IS NOT NULL
        THEN v_row.first_name || ' ' || LEFT(v_row.last_name, 1) || '.'
      ELSE COALESCE(v_row.full_name, 'Unknown')
    END;

    INSERT INTO _leaderboard_temp (rep_id, display_name, quota, booked, prev_booked, is_current)
    VALUES (v_row.id, v_display_name, v_row.quota, v_booked, v_prev_booked, v_row.id = v_caller_id);
  END LOOP;

  -- Build sorted output with ranks
  FOR v_row IN
    SELECT display_name, quota, booked, prev_booked, is_current
    FROM _leaderboard_temp
    ORDER BY booked DESC
  LOOP
    v_rank := v_rank + 1;
    v_attainment := CASE WHEN v_row.quota > 0 THEN ROUND((v_row.booked / v_row.quota) * 100, 1) ELSE 0 END;
    v_trend := CASE
      WHEN v_row.prev_booked = 0 AND v_row.booked > 0 THEN 'up'
      WHEN v_row.booked > v_row.prev_booked THEN 'up'
      WHEN v_row.booked < v_row.prev_booked THEN 'down'
      ELSE 'flat'
    END;

    v_results := v_results || jsonb_build_object(
      'rank', v_rank,
      'repDisplayName', v_row.display_name,
      'attainmentPct', v_attainment,
      'trend', v_trend,
      'isCurrentUser', v_row.is_current
    );
  END LOOP;

  DROP TABLE IF EXISTS _leaderboard_temp;

  RETURN jsonb_build_object('leaderboard', v_results, 'currentUserId', v_caller_id);
END;
$$;

GRANT EXECUTE ON FUNCTION get_sales_goal_leaderboard(date) TO authenticated;
