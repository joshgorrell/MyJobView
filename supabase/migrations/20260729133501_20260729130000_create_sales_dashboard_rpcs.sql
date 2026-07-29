/*
# Create Sales Dashboard KPI RPCs

1. Purpose
  These four server-side functions enforce authorization independently from the frontend.
  A regular sales rep can never retrieve another rep's detailed data even by modifying frontend state.

  - get_my_sales_dashboard(date_reference) → returns SalesDashboardResult for the CALLING user only
  - get_sales_rep_dashboard(target_rep_id, date_reference) → verifies target_rep_id = auth.uid() OR caller is authorized manager/admin
  - get_sales_team_dashboard(rep_ids, date_reference) → management-only; verifies each rep is in caller's org
  - get_sales_goal_leaderboard(date_reference) → privacy-safe; returns only rank, displayName, attainmentPct, trend, isCurrentUser

2. Sales-Credit Rule (used in ALL functions)
  CASE WHEN sales_rep_id IS NOT NULL THEN sales_rep_id ELSE created_by END

3. Booked-Date Rule (used in ALL functions)
  COALESCE(booked_at, created_at)

4. Qualified Pipeline Statuses
  designing, ready_to_submit, sent, portal

5. Close-Rate Statuses
  Won:  approved, approved_pending_action
  Lost: declined, cancelled, expired

6. Security
  - get_my_sales_dashboard: SECURITY DEFINER, enforces auth.uid() as the rep
  - get_sales_rep_dashboard: SECURITY DEFINER, enforces target = self OR caller is manager/admin in same org
  - get_sales_team_dashboard: SECURITY DEFINER, enforces caller is manager/admin and all rep_ids are in same org
  - get_sales_goal_leaderboard: SECURITY DEFINER, privacy-safe output only
*/

-- ── Helper: check if caller is manager or admin ─────────────────────
CREATE OR REPLACE FUNCTION is_manager_or_admin(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_user_id
      AND role IN ('admin', 'manager', 'sales_manager')
  );
$$;

-- ── Helper: get caller's organization_id ────────────────────────────
CREATE OR REPLACE FUNCTION get_caller_org_id(p_user_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM profiles WHERE id = p_user_id;
$$;

-- ── 1. get_my_sales_dashboard ──────────────────────────────────────
-- Returns the full dashboard data for the calling user.
CREATE OR REPLACE FUNCTION get_my_sales_dashboard(p_date_reference date DEFAULT CURRENT_DATE)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rep_id uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_rep_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  -- Delegate to get_sales_rep_dashboard with target = self
  SELECT * FROM get_sales_rep_dashboard(v_rep_id, p_date_reference) INTO v_result;
  RETURN v_result;
END;
$$;

-- ── 2. get_sales_rep_dashboard ──────────────────────────────────────
-- Returns dashboard data for a specific rep. Enforces authorization.
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
  v_quota_periods jsonb;
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
  v_now timestamptz := now();
  v_month_start timestamptz;
  v_month_end timestamptz;
  v_prev_month_start timestamptz;
  v_prev_month_end timestamptz;
  v_90_days_ago timestamptz;
  v_row record;
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

  -- Quota info from calculate_sales_quota
  SELECT * FROM calculate_sales_quota(p_target_rep_id, p_date_reference) INTO v_quota_info;
  v_annual_quota := COALESCE((v_quota_info->>'current_annual_quota')::numeric, 0);
  v_monthly_quota := COALESCE((v_quota_info->>'current_monthly_quota')::numeric, 0);

  -- Determine quota period (anniversary year)
  v_quota_start_date := COALESCE(v_profile.sales_rep_start_date, (v_quota_info->>'start_date')::date, p_date_reference);
  v_quota_end_date := (v_quota_start_date + INTERVAL '1 year' - INTERVAL '1 day')::date;

  -- Elapsed percentage of quota period
  IF v_quota_end_date > v_quota_start_date THEN
    v_quota_elapsed_pct := LEAST(100, ROUND(
      (EXTRACT(EPOCH FROM (p_date_reference::timestamp - v_quota_start_date::timestamp)) /
       EXTRACT(EPOCH FROM (v_quota_end_date::timestamp - v_quota_start_date::timestamp)) * 100)::numeric, 1
    ));
  ELSE
    v_quota_elapsed_pct := 100;
  END IF;

  -- Booked sales this quota period (using sales_rep_id with created_by fallback, booked_at with created_at fallback)
  SELECT COALESCE(SUM(contract_total), 0), COUNT(*)
  INTO v_booked_sales, v_booked_count
  FROM sales_orders
  WHERE (CASE WHEN sales_rep_id IS NOT NULL THEN sales_rep_id ELSE created_by END) = p_target_rep_id
    AND COALESCE(booked_at, created_at) >= v_quota_start_date::timestamptz
    AND COALESCE(booked_at, created_at) <= v_quota_end_date::timestamptz
    AND status NOT IN ('cancelled', 'voided');

  -- Previous period booked sales (same period one year ago)
  SELECT COALESCE(SUM(contract_total), 0), COUNT(*)
  INTO v_prev_booked_sales, v_prev_booked_count
  FROM sales_orders
  WHERE (CASE WHEN sales_rep_id IS NOT NULL THEN sales_rep_id ELSE created_by END) = p_target_rep_id
    AND COALESCE(booked_at, created_at) >= (v_quota_start_date - INTERVAL '1 year')::timestamptz
    AND COALESCE(booked_at, created_at) <= (v_quota_end_date - INTERVAL '1 year')::timestamptz
    AND status NOT IN ('cancelled', 'voided');

  -- Average sale
  v_avg_sale := CASE WHEN v_booked_count > 0 THEN v_booked_sales / v_booked_count ELSE 0 END;

  -- Pipeline (qualified statuses)
  SELECT COALESCE(SUM(total), 0), COUNT(*)
  INTO v_pipeline_total, v_pipeline_count
  FROM proposals
  WHERE created_by = p_target_rep_id
    AND status IN ('designing', 'ready_to_submit', 'sent', 'portal');

  -- Close rate (won / (won + lost)) for current quota period
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

  -- Monthly trend (12 months of booked sales)
  v_month_start := date_trunc('month', p_date_reference::timestamptz);
  FOR i IN 0..11 LOOP
    v_row := NULL;
    SELECT COALESCE(SUM(contract_total), 0) AS total, COUNT(*) AS cnt
    INTO v_row
    FROM sales_orders
    WHERE (CASE WHEN sales_rep_id IS NOT NULL THEN sales_rep_id ELSE created_by END) = p_target_rep_id
      AND COALESCE(booked_at, created_at) >= (v_month_start - (i || ' months')::interval)
      AND COALESCE(booked_at, created_at) < (v_month_start - ((i - 1) || ' months')::interval)
      AND status NOT IN ('cancelled', 'voided');

    v_monthly_trend := v_monthly_trend || jsonb_build_object(
      'month', to_char((v_month_start - (i || ' months')::interval)::date, 'YYYY-MM'),
      'total', v_row.total,
      'count', v_row.cnt
    );
  END LOOP;

  -- 90-day run rate
  v_90_days_ago := p_date_reference::timestamptz - INTERVAL '90 days';
  SELECT COALESCE(SUM(contract_total), 0)
  INTO v_run_rate_90
  FROM sales_orders
  WHERE (CASE WHEN sales_rep_id IS NOT NULL THEN sales_rep_id ELSE created_by END) = p_target_rep_id
    AND COALESCE(booked_at, created_at) >= v_90_days_ago
    AND COALESCE(booked_at, created_at) <= p_date_reference::timestamptz
    AND status NOT IN ('cancelled', 'voided');

  -- Annualized run rate: (90-day total / 90) * 365
  v_run_rate_90 := ROUND((v_run_rate_90 / 90.0) * 365, 2);

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
    'monthlyTrend', v_monthly_trend
  );
END;
$$;

-- ── 3. get_sales_team_dashboard ─────────────────────────────────────
-- Management-only: returns dashboard data for multiple reps.
CREATE OR REPLACE FUNCTION get_sales_team_dashboard(
  p_rep_ids uuid[],
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
  v_rep_id uuid;
  v_results jsonb := '[]'::jsonb;
  v_single jsonb;
BEGIN
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  IF NOT is_manager_or_admin(v_caller_id) THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  v_caller_org := get_caller_org_id(v_caller_id);

  FOREACH v_rep_id IN ARRAY p_rep_ids LOOP
    -- Verify rep is in same org
    PERFORM 1 FROM profiles WHERE id = v_rep_id AND organization_id = v_caller_org;
    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    SELECT * FROM get_sales_rep_dashboard(v_rep_id, p_date_reference) INTO v_single;
    v_results := v_results || jsonb_build_array(v_single);
  END LOOP;

  RETURN jsonb_build_object('reps', v_results);
END;
$$;

-- ── 4. get_sales_goal_leaderboard ───────────────────────────────────
-- Privacy-safe: returns only rank, displayName (first name + last initial), attainmentPct, trend, isCurrentUser.
-- Never returns dollars, quota, pipeline, customer, margin, or commission data.
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
BEGIN
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  v_caller_org := get_caller_org_id(v_caller_id);
  IF v_caller_org IS NULL THEN
    RETURN jsonb_build_object('error', 'no_organization');
  END IF;

  FOR v_row IN
    SELECT p.id, p.first_name, p.last_name, p.full_name,
           COALESCE(p.current_annual_quota, 0) AS quota,
           COALESCE((
             SELECT SUM(so.contract_total)
             FROM sales_orders so
             WHERE (CASE WHEN so.sales_rep_id IS NOT NULL THEN so.sales_rep_id ELSE so.created_by END) = p.id
               AND COALESCE(so.booked_at, so.created_at) >= COALESCE(p.sales_rep_start_date, p.created_at::date)::timestamptz
               AND COALESCE(so.booked_at, so.created_at) <= (COALESCE(p.sales_rep_start_date, p.created_at::date) + INTERVAL '1 year - 1 day')::timestamptz
               AND so.status NOT IN ('cancelled', 'voided')
           ), 0) AS booked,
           COALESCE((
             SELECT SUM(so.contract_total)
             FROM sales_orders so
             WHERE (CASE WHEN so.sales_rep_id IS NOT NULL THEN so.sales_rep_id ELSE so.created_by END) = p.id
               AND COALESCE(so.booked_at, so.created_at) >= (COALESCE(p.sales_rep_start_date, p.created_at::date) - INTERVAL '1 year')::timestamptz
               AND COALESCE(so.booked_at, so.created_at) <= (COALESCE(p.sales_rep_start_date, p.created_at::date) - INTERVAL '1 day')::timestamptz
               AND so.status NOT IN ('cancelled', 'voided')
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

-- Grant execute to authenticated
GRANT EXECUTE ON FUNCTION get_my_sales_dashboard(date) TO authenticated;
GRANT EXECUTE ON FUNCTION get_sales_rep_dashboard(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION get_sales_team_dashboard(uuid[], date) TO authenticated;
GRANT EXECUTE ON FUNCTION get_sales_goal_leaderboard(date) TO authenticated;
GRANT EXECUTE ON FUNCTION is_manager_or_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_caller_org_id(uuid) TO authenticated;
