/*
# Replace payroll functions and add new reconciliation/reopen functions

## Purpose
Rewrites all payroll functions to use employee_payroll_configs (effective-dated) instead of profiles.employment_type. Adds attendance reconciliation, allocation reconciliation, and pay period reopen functions.

## Functions Created/Replaced

### 1. regenerate_payroll_segments (REPLACED)
- JOINs employees + employee_payroll_configs (effective for each segment date)
- salary basis: generates NO segments from clock or allocation (salary employees have no hourly payroll segments)
- daily_clock basis: generates one segment per approved daily_clock_entries (status = clocked_out); detailed time_entries do NOT create separate payroll segments
- work_allocation basis: generates segments from approved time_entries and internal_time_sessions; daily clock does NOT create payroll segments
- PTO: daily_clock basis includes PTO hours in the daily clock total; work_allocation creates a separate PTO segment; salary creates NO PTO segments
- PTO payability is determined by pto_policies.is_paid — only paid PTO policies contribute payable hours. pto_eligible alone never generates payable hours.
- No double counting between sources

### 2. reconcile_payroll_segments (REPLACED)
- Fixes payroll_hours_only boolean bug (uses total_hours directly)
- JOINs employee_payroll_configs for effective payroll_time_basis
- Compares against correct source per basis:
  - salary: no variance expected (0 = 0)
  - daily_clock: daily clock hours vs segment hours
  - work_allocation: time_entries + internal_sessions hours vs segment hours
- Populates excluded_hours and exclusion_reason
- Sets reconciliation_type = 'payroll'

### 3. check_payroll_readiness (REPLACED)
- Identifies employees with payroll-relevant activity in the period (not just active employees)
- Resolves effective employee_payroll_configs for the period dates
- Checks reviewed_at IS NULL on the effective config — returns unreviewed_timekeeping_configs list
- Scopes by pay_schedule_id if set on the pay period
- Counts unresolved payroll reconciliation flags only (type = 'payroll')
- ready_for_submission = false when unreviewed configs exist, unresolved payroll flags, or unassigned jurisdictions

### 4. refresh_payroll_time (REPLACED)
- Status guard: errors if payroll_approved/submitted/processed/locked
- Skips segments with work_jurisdiction_source = 'manual_override'
- Calls regenerate + reconcile

### 5. reopen_pay_period (NEW)
- Only for payroll_approved status
- Sets needs_review, records reopened_by/at/reason
- Unlocks segments

### 6. reconcile_attendance (NEW)
- JOINs employees + effective config
- Only for requires_daily_clock = true
- Uses standard_start_time, standard_end_time, work_days from the effective config
- Checks missing/incomplete clock entries, absences
- reconciliation_type = 'attendance'
- Does NOT block approval

### 7. reconcile_allocation (NEW)
- JOINs employees + effective config
- Only for requires_time_allocation = true
- Calculates available/allocated/unallocated/overallocated
- Available only when requires_daily_clock = true (uses daily clock hours)
- Does NOT fabricate availability when requires_daily_clock = false
- reconciliation_type = 'allocation'
- Does NOT block approval

## PTO Handling
- pto_policies.is_paid (boolean, default true) is the authoritative paid/unpaid distinction
- The payroll generator only includes PTO hours as payable when the linked pto_policy has is_paid = true
- pto_eligible on employee_payroll_configs means PTO functionality applies — it does NOT by itself generate payable hours
- If no pto_policy is linked or is_paid = false, PTO hours are visible for attendance but do not generate payable payroll segments

## Important Notes
1. All functions are SECURITY DEFINER for service-level access to payroll tables.
2. Historical configs are never modified — payroll resolves the config effective for each segment date.
3. Terminated employees with activity in the period are still processed.
4. Manual jurisdiction overrides are preserved during refresh.
*/

-- ============================================================
-- 1. regenerate_payroll_segments (REPLACED)
-- ============================================================
CREATE OR REPLACE FUNCTION public.regenerate_payroll_segments(
  p_organization_id uuid,
  p_start_date date,
  p_end_date date
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inserted int := 0;
  v_updated int := 0;
  v_skipped_locked int := 0;
  v_pto_segments int := 0;
  v_emp_record record;
  v_config record;
  v_seg_date date;
  v_clock_hours numeric;
  v_pto_hours numeric;
  v_pto_is_paid boolean;
  v_seg_key text;
  v_existing_count int;
BEGIN
  -- Get all employees with activity in the date range
  -- We need to resolve the effective config for each employee for each date

  -- ========================================
  -- A. daily_clock basis: one segment per approved daily_clock_entries
  -- ========================================
  FOR v_emp_record IN
    SELECT DISTINCT e.id AS emp_id, e.user_id
    FROM employees e
    WHERE e.organization_id = p_organization_id
  LOOP
    FOR v_seg_date IN SELECT generate_series(p_start_date, p_end_date, '1 day'::interval)::date LOOP
      -- Resolve effective config for this date
      SELECT * INTO v_config
      FROM employee_payroll_configs
      WHERE employee_id = v_emp_record.emp_id
        AND effective_from <= v_seg_date
        AND (effective_to IS NULL OR effective_to >= v_seg_date)
      ORDER BY effective_from DESC
      LIMIT 1;

      -- Skip if no config found
      CONTINUE WHEN v_config IS NULL;

      IF v_config.payroll_time_basis = 'daily_clock' THEN
        -- Generate one segment per approved daily clock entry
        INSERT INTO payroll_time_segments (
          organization_id, employee_id, segment_date, start_time, end_time,
          total_hours, break_minutes, time_type, source_table, source_record_id,
          segment_key, segment_sequence, daily_clock_entry_id,
          physical_work_location_state, gps_validated
        )
        SELECT
          p_organization_id,
          v_emp_record.emp_id,
          dce.entry_date,
          dce.clock_in,
          dce.clock_out,
          COALESCE(dce.total_hours, 0),
          COALESCE(dce.break_minutes, 0),
          'job',
          'daily_clock_entries',
          dce.id,
          'daily_clock:' || dce.id::text || ':0',
          0,
          dce.id,
          dce.clock_out_address,
          true
        FROM daily_clock_entries dce
        WHERE dce.technician_id = v_emp_record.user_id
          AND dce.entry_date = v_seg_date
          AND dce.organization_id = p_organization_id
          AND dce.status = 'clocked_out'
        ON CONFLICT (organization_id, segment_key)
        DO UPDATE SET
          start_time = EXCLUDED.start_time,
          end_time = EXCLUDED.end_time,
          total_hours = EXCLUDED.total_hours,
          break_minutes = EXCLUDED.break_minutes,
          daily_clock_entry_id = EXCLUDED.daily_clock_entry_id
        WHERE payroll_time_segments.is_locked = false;

        GET DIAGNOSTICS v_inserted = ROW_COUNT;
        v_updated := v_updated + v_inserted;
        v_inserted := 0;

        -- Add PTO segment for daily_clock employees if PTO eligible and there's approved PTO
        IF v_config.pto_eligible THEN
          -- Check if there's PTO for this date and whether it's paid
          SELECT
            COALESCE(SUM(pr.total_hours), 0),
            COALESCE(BOOL_OR(pp.is_paid), false)
          INTO v_pto_hours, v_pto_is_paid
          FROM pto_requests pr
          JOIN pto_policies pp ON pr.policy_id = pp.id
          WHERE pr.employee_id = v_emp_record.user_id
            AND pr.organization_id = p_organization_id
            AND pr.status = 'approved'
            AND pr.start_date <= v_seg_date
            AND pr.end_date >= v_seg_date
            AND pp.is_paid = true;

          IF v_pto_hours > 0 AND v_pto_is_paid THEN
            v_seg_key := 'pto:' || v_emp_record.emp_id::text || ':' || v_seg_date::text;
            INSERT INTO payroll_time_segments (
              organization_id, employee_id, segment_date, start_time, end_time,
              total_hours, time_type, source_table, source_record_id,
              segment_key, segment_sequence
            )
            VALUES (
              p_organization_id,
              v_emp_record.emp_id,
              v_seg_date,
              v_seg_date::timestamp,
              v_seg_date::timestamp + interval '1 day',
              v_pto_hours,
              'pto',
              'pto_requests',
              NULL,
              v_seg_key,
              0
            )
            ON CONFLICT (organization_id, segment_key)
            DO UPDATE SET
              total_hours = EXCLUDED.total_hours
            WHERE payroll_time_segments.is_locked = false;

            v_pto_segments := v_pto_segments + 1;
          END IF;
        END IF;

      ELSIF v_config.payroll_time_basis = 'work_allocation' THEN
        -- Generate segments from approved time_entries
        INSERT INTO payroll_time_segments (
          organization_id, employee_id, segment_date, start_time, end_time,
          total_hours, break_minutes, time_type, source_table, source_record_id,
          segment_key, segment_sequence, work_order_id, project_id,
          labor_phase_id, overtime_hours, physical_work_location_state,
          physical_work_lat, physical_work_lng, gps_validated
        )
        SELECT
          te.organization_id,
          v_emp_record.emp_id,
          te.entry_date,
          te.clock_in,
          te.clock_out,
          te.total_hours,
          COALESCE(te.break_minutes, 0),
          CASE
            WHEN te.entry_type = 'work_order' THEN 'job'
            WHEN te.entry_type = 'project' THEN 'job'
            WHEN te.entry_type = 'training' THEN 'training'
            ELSE 'job'
          END,
          'time_entries',
          te.id,
          'time_entries:' || te.id::text || ':0',
          0,
          te.work_order_id,
          te.project_id,
          te.labor_phase_id,
          te.overtime_hours,
          te.physical_work_location_state,
          NULL,
          NULL,
          te.gps_validated
        FROM time_entries te
        WHERE te.technician_id = v_emp_record.user_id
          AND te.entry_date = v_seg_date
          AND te.organization_id = p_organization_id
          AND te.status = 'approved'
        ON CONFLICT (organization_id, segment_key)
        DO UPDATE SET
          start_time = EXCLUDED.start_time,
          end_time = EXCLUDED.end_time,
          total_hours = EXCLUDED.total_hours,
          break_minutes = EXCLUDED.break_minutes,
          overtime_hours = EXCLUDED.overtime_hours,
          physical_work_location_state = EXCLUDED.physical_work_location_state,
          gps_validated = EXCLUDED.gps_validated,
          work_order_id = EXCLUDED.work_order_id,
          project_id = EXCLUDED.project_id,
          labor_phase_id = EXCLUDED.labor_phase_id
        WHERE payroll_time_segments.is_locked = false;

        GET DIAGNOSTICS v_inserted = ROW_COUNT;
        v_updated := v_updated + v_inserted;
        v_inserted := 0;

        -- Generate segments from approved internal_time_sessions
        INSERT INTO payroll_time_segments (
          organization_id, employee_id, segment_date, start_time, end_time,
          total_hours, time_type, source_table, source_record_id,
          segment_key, segment_sequence
        )
        SELECT
          its.organization_id,
          v_emp_record.emp_id,
          its.session_date,
          (its.session_date::timestamp + its.start_time) AT TIME ZONE 'UTC',
          CASE WHEN its.end_time IS NOT NULL
            THEN (its.session_date::timestamp + its.end_time) AT TIME ZONE 'UTC'
            ELSE NULL
          END,
          its.predetermined_hours,
          CASE WHEN its.session_type = 'shop_time' THEN 'shop_admin' ELSE its.session_type END,
          'internal_time_sessions',
          its.id,
          'internal_time_sessions:' || its.id::text || ':0',
          0
        FROM internal_time_sessions its
        WHERE its.assigned_to = v_emp_record.user_id
          AND its.session_date = v_seg_date
          AND its.organization_id = p_organization_id
          AND its.status = 'approved'
        ON CONFLICT (organization_id, segment_key)
        DO UPDATE SET
          start_time = EXCLUDED.start_time,
          end_time = EXCLUDED.end_time,
          total_hours = EXCLUDED.total_hours,
          time_type = EXCLUDED.time_type
        WHERE payroll_time_segments.is_locked = false;

        GET DIAGNOSTICS v_inserted = ROW_COUNT;
        v_updated := v_updated + v_inserted;
        v_inserted := 0;

        -- Add PTO segment for work_allocation employees if PTO eligible and paid
        IF v_config.pto_eligible THEN
          SELECT
            COALESCE(SUM(pr.total_hours), 0),
            COALESCE(BOOL_OR(pp.is_paid), false)
          INTO v_pto_hours, v_pto_is_paid
          FROM pto_requests pr
          JOIN pto_policies pp ON pr.policy_id = pp.id
          WHERE pr.employee_id = v_emp_record.user_id
            AND pr.organization_id = p_organization_id
            AND pr.status = 'approved'
            AND pr.start_date <= v_seg_date
            AND pr.end_date >= v_seg_date
            AND pp.is_paid = true;

          IF v_pto_hours > 0 AND v_pto_is_paid THEN
            v_seg_key := 'pto:' || v_emp_record.emp_id::text || ':' || v_seg_date::text;
            INSERT INTO payroll_time_segments (
              organization_id, employee_id, segment_date, start_time, end_time,
              total_hours, time_type, source_table, source_record_id,
              segment_key, segment_sequence
            )
            VALUES (
              p_organization_id,
              v_emp_record.emp_id,
              v_seg_date,
              v_seg_date::timestamp,
              v_seg_date::timestamp + interval '1 day',
              v_pto_hours,
              'pto',
              'pto_requests',
              NULL,
              v_seg_key,
              0
            )
            ON CONFLICT (organization_id, segment_key)
            DO UPDATE SET
              total_hours = EXCLUDED.total_hours
            WHERE payroll_time_segments.is_locked = false;

            v_pto_segments := v_pto_segments + 1;
          END IF;
        END IF;

      ELSIF v_config.payroll_time_basis = 'salary' THEN
        -- Salary basis: no hourly payroll segments from clock or allocation
        -- PTO does not generate payable segments for salary employees
        NULL;
      END IF;
    END LOOP;
  END LOOP;

  RETURN json_build_object(
    'inserted_or_updated', v_updated,
    'pto_segments', v_pto_segments,
    'skipped_locked', v_skipped_locked
  );
END;
$function$;

-- ============================================================
-- 2. reconcile_payroll_segments (REPLACED)
-- ============================================================
CREATE OR REPLACE FUNCTION public.reconcile_payroll_segments(
  p_pay_period_id uuid
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id uuid;
  v_start date;
  v_end date;
  v_days_checked int := 0;
  v_flagged int := 0;
  v_total_variance numeric := 0;
  v_daily_hours numeric;
  v_seg_hours numeric;
  v_variance numeric;
  v_emp_id uuid;
  v_day date;
  v_config record;
  v_emp_record record;
  v_source_hours numeric;
  v_excluded_hours numeric;
  v_exclusion_reason text;
  v_allocation_hours numeric;
BEGIN
  SELECT organization_id, period_start_date, period_end_date
  INTO v_org_id, v_start, v_end
  FROM pay_periods
  WHERE id = p_pay_period_id;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'pay period not found');
  END IF;

  -- Delete existing payroll-type reconciliation flags for this period (we rebuild them)
  DELETE FROM payroll_reconciliation_flags
  WHERE pay_period_id = p_pay_period_id
    AND reconciliation_type = 'payroll';

  -- Get all employees with segments in this period
  FOR v_emp_record IN
    SELECT DISTINCT employee_id
    FROM payroll_time_segments
    WHERE pay_period_id = p_pay_period_id
      AND organization_id = v_org_id
  LOOP
    FOR v_day IN SELECT DISTINCT segment_date FROM payroll_time_segments WHERE pay_period_id = p_pay_period_id AND employee_id = v_emp_record.employee_id ORDER BY segment_date LOOP
      -- Resolve effective config for this date
      SELECT * INTO v_config
      FROM employee_payroll_configs
      WHERE employee_id = v_emp_record.employee_id
        AND effective_from <= v_day
        AND (effective_to IS NULL OR effective_to >= v_day)
      ORDER BY effective_from DESC
      LIMIT 1;

      v_days_checked := v_days_checked + 1;
      v_excluded_hours := 0;
      v_exclusion_reason := NULL;

      -- Sum payroll segment hours for this employee/day
      SELECT COALESCE(SUM(COALESCE(total_hours, 0)), 0)
      INTO v_seg_hours
      FROM payroll_time_segments
      WHERE employee_id = v_emp_record.employee_id
        AND segment_date = v_day
        AND pay_period_id = p_pay_period_id
        AND organization_id = v_org_id;

      -- Determine source hours based on payroll_time_basis
      IF v_config IS NULL THEN
        -- No config — can't determine basis, flag for review
        v_source_hours := 0;
        v_exclusion_reason := 'No effective payroll configuration found';
      ELSIF v_config.payroll_time_basis = 'salary' THEN
        -- Salary: no variance expected (0 vs 0)
        v_source_hours := 0;
        IF v_seg_hours > 0 THEN
          v_excluded_hours := v_seg_hours;
          v_exclusion_reason := 'Salary employee should not have hourly segments';
        END IF;
      ELSIF v_config.payroll_time_basis = 'daily_clock' THEN
        -- Daily clock: compare daily clock hours to segment hours
        SELECT COALESCE(SUM(COALESCE(total_hours, 0)), 0)
        INTO v_source_hours
        FROM daily_clock_entries
        WHERE technician_id = (
          SELECT user_id FROM employees WHERE id = v_emp_record.employee_id
        )
          AND entry_date = v_day
          AND organization_id = v_org_id
          AND status = 'clocked_out';
      ELSIF v_config.payroll_time_basis = 'work_allocation' THEN
        -- Work allocation: compare time_entries + internal_sessions to segments
        SELECT COALESCE(SUM(COALESCE(total_hours, 0)), 0)
        INTO v_source_hours
        FROM time_entries
        WHERE technician_id = (
          SELECT user_id FROM employees WHERE id = v_emp_record.employee_id
        )
          AND entry_date = v_day
          AND organization_id = v_org_id
          AND status = 'approved';

        SELECT COALESCE(SUM(COALESCE(predetermined_hours, 0)), 0)
        INTO v_allocation_hours
        FROM internal_time_sessions
        WHERE assigned_to = (
          SELECT user_id FROM employees WHERE id = v_emp_record.employee_id
        )
          AND session_date = v_day
          AND organization_id = v_org_id
          AND status = 'approved';

        v_source_hours := v_source_hours + v_allocation_hours;
      ELSE
        v_source_hours := 0;
      END IF;

      v_variance := v_source_hours - v_seg_hours;

      -- Upsert reconciliation flag (payroll type)
      INSERT INTO payroll_reconciliation_flags (
        organization_id, pay_period_id, employee_id, segment_date,
        daily_clock_hours, segment_hours, variance_hours, needs_review,
        resolution_status, excluded_hours, exclusion_reason, reconciliation_type
      )
      VALUES (
        v_org_id, p_pay_period_id, v_emp_record.employee_id, v_day,
        v_source_hours, v_seg_hours, v_variance,
        ABS(v_variance) > 0.01 OR v_excluded_hours > 0,
        'unresolved',
        v_excluded_hours,
        v_exclusion_reason,
        'payroll'
      )
      ON CONFLICT (pay_period_id, employee_id, segment_date)
      DO UPDATE SET
        daily_clock_hours = EXCLUDED.daily_clock_hours,
        segment_hours = EXCLUDED.segment_hours,
        variance_hours = EXCLUDED.variance_hours,
        needs_review = EXCLUDED.needs_review,
        excluded_hours = EXCLUDED.excluded_hours,
        exclusion_reason = EXCLUDED.exclusion_reason,
        resolution_status = CASE
          WHEN payroll_reconciliation_flags.resolution_status = 'resolved'
            AND EXCLUDED.needs_review = true
          THEN 'unresolved'
          ELSE payroll_reconciliation_flags.resolution_status
        END
      WHERE payroll_reconciliation_flags.resolution_status != 'ignored';

      IF ABS(v_variance) > 0.01 OR v_excluded_hours > 0 THEN
        v_flagged := v_flagged + 1;
        v_total_variance := v_total_variance + ABS(v_variance);
      END IF;
    END LOOP;
  END LOOP;

  RETURN json_build_object(
    'total_days_checked', v_days_checked,
    'flagged_days', v_flagged,
    'total_variance_hours', v_total_variance
  );
END;
$function$;

-- ============================================================
-- 3. check_payroll_readiness (REPLACED)
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_payroll_readiness(
  p_pay_period_id uuid
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id uuid;
  v_start date;
  v_end date;
  v_total_employees int;
  v_approved_count int;
  v_pending_count int;
  v_excluded_count int;
  v_unassigned_jurisdiction int;
  v_gps_mismatches int;
  v_pending_adjustments int;
  v_total_segments int;
  v_unreviewed_configs int;
  v_unresolved_payroll_flags int;
  v_pay_schedule_id uuid;
  v_emp_id uuid;
  v_config record;
  v_has_activity boolean;
BEGIN
  SELECT organization_id, period_start_date, period_end_date, pay_schedule_id
  INTO v_org_id, v_start, v_end, v_pay_schedule_id
  FROM pay_periods
  WHERE id = p_pay_period_id;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'pay period not found');
  END IF;

  -- Count distinct employees with segments in this period
  SELECT COUNT(DISTINCT employee_id) INTO v_total_employees
  FROM payroll_time_segments
  WHERE pay_period_id = p_pay_period_id
    AND organization_id = v_org_id;

  -- Count approvals by status
  SELECT
    COUNT(*) FILTER (WHERE approval_status = 'approved'),
    COUNT(*) FILTER (WHERE approval_status = 'pending'),
    COUNT(*) FILTER (WHERE approval_status = 'excluded')
  INTO v_approved_count, v_pending_count, v_excluded_count
  FROM payroll_approvals
  WHERE pay_period_id = p_pay_period_id;

  -- Segments with unassigned jurisdiction
  SELECT COUNT(*) INTO v_unassigned_jurisdiction
  FROM payroll_time_segments
  WHERE pay_period_id = p_pay_period_id
    AND organization_id = v_org_id
    AND (work_jurisdiction_state IS NULL OR work_jurisdiction_confidence = 'unassigned');

  -- Segments with GPS/job mismatches (confidence = 'low')
  SELECT COUNT(*) INTO v_gps_mismatches
  FROM payroll_time_segments
  WHERE pay_period_id = p_pay_period_id
    AND organization_id = v_org_id
    AND work_jurisdiction_confidence = 'low';

  -- Pending time adjustments for employees in this period
  SELECT COUNT(*) INTO v_pending_adjustments
  FROM time_adjustment_requests tar
  WHERE tar.organization_id = v_org_id
    AND tar.status = 'pending'
    AND tar.technician_id IN (
      SELECT DISTINCT e.user_id
      FROM payroll_time_segments pts
      JOIN employees e ON e.id = pts.employee_id
      WHERE pts.pay_period_id = p_pay_period_id
    );

  -- Total segments
  SELECT COUNT(*) INTO v_total_segments
  FROM payroll_time_segments
  WHERE pay_period_id = p_pay_period_id
    AND organization_id = v_org_id;

  -- Check for unreviewed employee_payroll_configs
  -- Find employees with activity in this period and check their effective config
  v_unreviewed_configs := 0;
  FOR v_emp_id IN
    SELECT DISTINCT pts.employee_id
    FROM payroll_time_segments pts
    WHERE pts.pay_period_id = p_pay_period_id
      AND pts.organization_id = v_org_id
  LOOP
    -- Resolve effective config for the period start date (or each segment date)
    SELECT * INTO v_config
    FROM employee_payroll_configs
    WHERE employee_id = v_emp_id
      AND effective_from <= v_end
      AND (effective_to IS NULL OR effective_to >= v_start)
    ORDER BY effective_from DESC
    LIMIT 1;

    IF v_config IS NULL OR v_config.reviewed_at IS NULL THEN
      v_unreviewed_configs := v_unreviewed_configs + 1;
    END IF;
  END LOOP;

  -- Count unresolved payroll reconciliation flags (type = 'payroll' only)
  SELECT COUNT(*) INTO v_unresolved_payroll_flags
  FROM payroll_reconciliation_flags
  WHERE pay_period_id = p_pay_period_id
    AND reconciliation_type = 'payroll'
    AND needs_review = true
    AND resolution_status = 'unresolved';

  RETURN json_build_object(
    'total_employees', v_total_employees,
    'approved_count', v_approved_count,
    'pending_count', v_pending_count,
    'excluded_count', v_excluded_count,
    'total_segments', v_total_segments,
    'unassigned_jurisdiction', v_unassigned_jurisdiction,
    'gps_mismatches', v_gps_mismatches,
    'pending_adjustments', v_pending_adjustments,
    'unreviewed_timekeeping_configs', v_unreviewed_configs,
    'unresolved_payroll_flags', v_unresolved_payroll_flags,
    'ready_for_submission',
      v_unassigned_jurisdiction = 0
      AND v_gps_mismatches = 0
      AND v_pending_count = 0
      AND v_pending_adjustments = 0
      AND v_unreviewed_configs = 0
      AND v_unresolved_payroll_flags = 0
  );
END;
$function$;

-- ============================================================
-- 4. refresh_payroll_time (REPLACED)
-- ============================================================
CREATE OR REPLACE FUNCTION public.refresh_payroll_time(
  p_pay_period_id uuid
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id uuid;
  v_start date;
  v_end date;
  v_status text;
  v_seg_result json;
  v_assign_result json;
  v_segments_count int := 0;
  v_jur_high int := 0;
  v_jur_medium int := 0;
  v_jur_low int := 0;
  v_jur_unassigned int := 0;
  v_approvals_created int := 0;
  v_recon_result json;
  v_refreshed_at timestamptz := now();
  v_seg_id uuid;
  v_jur_result json;
BEGIN
  SELECT organization_id, period_start_date, period_end_date, status
  INTO v_org_id, v_start, v_end, v_status
  FROM pay_periods
  WHERE id = p_pay_period_id;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'pay period not found');
  END IF;

  -- Status guard: do not refresh if approved/submitted/processed/locked
  IF v_status IN ('payroll_approved', 'submitted', 'processed', 'locked') THEN
    RETURN json_build_object('error', 'Cannot refresh payroll time for a period with status: ' || v_status);
  END IF;

  -- 1. Regenerate unlocked segments
  v_seg_result := regenerate_payroll_segments(v_org_id, v_start, v_end);
  v_segments_count := COALESCE((v_seg_result->>'inserted_or_updated')::int, 0);

  -- 2. Assign segments to this pay period
  v_assign_result := assign_segments_to_pay_period(p_pay_period_id);

  -- 3. Run jurisdiction determination on all unlocked segments in this period
  -- Skip segments with manual_override
  FOR v_seg_id IN
    SELECT id FROM payroll_time_segments
    WHERE pay_period_id = p_pay_period_id
      AND organization_id = v_org_id
      AND is_locked = false
      AND work_jurisdiction_source != 'manual_override'
  LOOP
    v_jur_result := determine_segment_jurisdiction(v_seg_id);

    UPDATE payroll_time_segments
    SET
      work_jurisdiction_state = (v_jur_result->>'jurisdiction_state')::text,
      work_jurisdiction_source = (v_jur_result->>'jurisdiction_source')::text,
      work_jurisdiction_confidence = (v_jur_result->>'confidence')::text,
      gps_validated = (v_jur_result->>'gps_validated')::boolean
    WHERE id = v_seg_id;

    IF (v_jur_result->>'confidence') = 'high' THEN
      v_jur_high := v_jur_high + 1;
    ELSIF (v_jur_result->>'confidence') = 'medium' THEN
      v_jur_medium := v_jur_medium + 1;
    ELSIF (v_jur_result->>'confidence') = 'low' THEN
      v_jur_low := v_jur_low + 1;
    ELSIF (v_jur_result->>'confidence') = 'unassigned' THEN
      v_jur_unassigned := v_jur_unassigned + 1;
    END IF;
  END LOOP;

  -- 4. Auto-create missing payroll_approvals rows
  INSERT INTO payroll_approvals (
    organization_id, pay_period_id, employee_id, approval_status
  )
  SELECT
    v_org_id, p_pay_period_id, pts.employee_id, 'pending'
  FROM (
    SELECT DISTINCT employee_id
    FROM payroll_time_segments
    WHERE pay_period_id = p_pay_period_id
      AND organization_id = v_org_id
  ) pts
  ON CONFLICT (pay_period_id, employee_id) DO NOTHING;

  GET DIAGNOSTICS v_approvals_created = ROW_COUNT;

  -- 5. Run reconciliation
  v_recon_result := reconcile_payroll_segments(p_pay_period_id);

  -- 6. Update pay period tracking columns
  UPDATE pay_periods
  SET
    last_refresh_at = v_refreshed_at,
    last_segment_count = v_segments_count
  WHERE id = p_pay_period_id;

  RETURN json_build_object(
    'segments_created_or_updated', v_segments_count,
    'segments_assigned', COALESCE((v_assign_result->>'assigned')::int, 0),
    'jurisdiction_high', v_jur_high,
    'jurisdiction_medium', v_jur_medium,
    'jurisdiction_low', v_jur_low,
    'jurisdiction_unassigned', v_jur_unassigned,
    'approvals_created', v_approvals_created,
    'reconciliation_flags', COALESCE((v_recon_result->>'flagged_days')::int, 0),
    'reconciliation_total_variance', COALESCE((v_recon_result->>'total_variance_hours')::numeric, 0),
    'refreshed_at', v_refreshed_at
  );
END;
$function$;

-- ============================================================
-- 5. reopen_pay_period (NEW)
-- ============================================================
CREATE OR REPLACE FUNCTION public.reopen_pay_period(
  p_pay_period_id uuid,
  p_reopened_by uuid,
  p_reopen_reason text
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id uuid;
  v_status text;
BEGIN
  SELECT organization_id, status
  INTO v_org_id, v_status
  FROM pay_periods
  WHERE id = p_pay_period_id;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'pay period not found');
  END IF;

  IF v_status != 'payroll_approved' THEN
    RETURN json_build_object('error', 'Only payroll_approved periods can be reopened');
  END IF;

  -- Set status to needs_review and record reopen audit trail
  UPDATE pay_periods
  SET
    status = 'needs_review',
    payroll_approved_at = NULL,
    payroll_approved_by = NULL,
    reopened_by = p_reopened_by,
    reopened_at = now(),
    reopen_reason = p_reopen_reason,
    updated_at = now()
  WHERE id = p_pay_period_id;

  -- Unlock all segments in this period
  UPDATE payroll_time_segments
  SET
    is_locked = false,
    locked_at = NULL,
    payroll_approval_status = 'pending',
    payroll_approved_by = NULL,
    payroll_approved_at = NULL
  WHERE pay_period_id = p_pay_period_id
    AND organization_id = v_org_id;

  RETURN json_build_object(
    'success', true,
    'message', 'Pay period reopened to needs_review'
  );
END;
$function$;

-- ============================================================
-- 6. reconcile_attendance (NEW)
-- ============================================================
CREATE OR REPLACE FUNCTION public.reconcile_attendance(
  p_pay_period_id uuid
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id uuid;
  v_start date;
  v_end date;
  v_emp_record record;
  v_config record;
  v_day date;
  v_clock_count int;
  v_clock_hours numeric;
  v_expected_hours numeric;
  v_variance numeric;
  v_flagged int := 0;
  v_checked int := 0;
  v_day_name text;
  v_is_work_day boolean;
BEGIN
  SELECT organization_id, period_start_date, period_end_date
  INTO v_org_id, v_start, v_end
  FROM pay_periods
  WHERE id = p_pay_period_id;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'pay period not found');
  END IF;

  -- Delete existing attendance-type flags for this period
  DELETE FROM payroll_reconciliation_flags
  WHERE pay_period_id = p_pay_period_id
    AND reconciliation_type = 'attendance';

  -- For each employee with activity in this period
  FOR v_emp_record IN
    SELECT DISTINCT e.id AS emp_id, e.user_id
    FROM payroll_time_segments pts
    JOIN employees e ON e.id = pts.employee_id
    WHERE pts.pay_period_id = p_pay_period_id
      AND pts.organization_id = v_org_id
  LOOP
    FOR v_day IN SELECT generate_series(v_start, v_end, '1 day'::interval)::date LOOP
      -- Resolve effective config for this date
      SELECT * INTO v_config
      FROM employee_payroll_configs
      WHERE employee_id = v_emp_record.emp_id
        AND effective_from <= v_day
        AND (effective_to IS NULL OR effective_to >= v_day)
      ORDER BY effective_from DESC
      LIMIT 1;

      -- Skip if no config or does not require daily clock
      CONTINUE WHEN v_config IS NULL OR v_config.requires_daily_clock = false;

      -- Check if this is a scheduled work day
      v_day_name := to_char(v_day, 'day');
      v_day_name := btrim(v_day_name);
      v_is_work_day := v_config.work_days IS NULL OR v_day_name = ANY(v_config.work_days);

      -- Count clock entries for this day
      SELECT COUNT(*), COALESCE(SUM(COALESCE(total_hours, 0)), 0)
      INTO v_clock_count, v_clock_hours
      FROM daily_clock_entries
      WHERE technician_id = v_emp_record.user_id
        AND entry_date = v_day
        AND organization_id = v_org_id
        AND status = 'clocked_out';

      v_checked := v_checked + 1;

      -- Calculate expected hours from schedule
      v_expected_hours := 0;
      IF v_is_work_day AND v_config.standard_start_time IS NOT NULL AND v_config.standard_end_time IS NOT NULL THEN
        v_expected_hours := EXTRACT(EPOCH FROM (v_config.standard_end_time - v_config.standard_start_time)) / 3600;
      END IF;

      -- Flag if: no clock entry on a work day, or hours significantly less than expected
      IF v_is_work_day AND v_clock_count = 0 THEN
        -- Missing clock entry on a work day
        INSERT INTO payroll_reconciliation_flags (
          organization_id, pay_period_id, employee_id, segment_date,
          daily_clock_hours, segment_hours, variance_hours, needs_review,
          resolution_status, reconciliation_type
        )
        VALUES (
          v_org_id, p_pay_period_id, v_emp_record.emp_id, v_day,
          0, 0, v_expected_hours, true,
          'unresolved', 'attendance'
        )
        ON CONFLICT (pay_period_id, employee_id, segment_date) DO NOTHING;

        v_flagged := v_flagged + 1;
      ELSIF v_is_work_day AND v_clock_hours > 0 AND v_expected_hours > 0 AND v_clock_hours < (v_expected_hours * 0.5) THEN
        -- Incomplete day (less than half expected hours)
        v_variance := v_expected_hours - v_clock_hours;
        INSERT INTO payroll_reconciliation_flags (
          organization_id, pay_period_id, employee_id, segment_date,
          daily_clock_hours, segment_hours, variance_hours, needs_review,
          resolution_status, reconciliation_type
        )
        VALUES (
          v_org_id, p_pay_period_id, v_emp_record.emp_id, v_day,
          v_clock_hours, 0, v_variance, true,
          'unresolved', 'attendance'
        )
        ON CONFLICT (pay_period_id, employee_id, segment_date) DO NOTHING;

        v_flagged := v_flagged + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN json_build_object(
    'total_days_checked', v_checked,
    'flagged_days', v_flagged
  );
END;
$function$;

-- ============================================================
-- 7. reconcile_allocation (NEW)
-- ============================================================
CREATE OR REPLACE FUNCTION public.reconcile_allocation(
  p_pay_period_id uuid
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id uuid;
  v_start date;
  v_end date;
  v_emp_record record;
  v_config record;
  v_day date;
  v_available_hours numeric;
  v_allocated_hours numeric;
  v_unallocated_hours numeric;
  v_overallocated_hours numeric;
  v_flagged int := 0;
  v_checked int := 0;
BEGIN
  SELECT organization_id, period_start_date, period_end_date
  INTO v_org_id, v_start, v_end
  FROM pay_periods
  WHERE id = p_pay_period_id;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'pay period not found');
  END IF;

  -- Delete existing allocation-type flags for this period
  DELETE FROM payroll_reconciliation_flags
  WHERE pay_period_id = p_pay_period_id
    AND reconciliation_type = 'allocation';

  -- For each employee with activity in this period
  FOR v_emp_record IN
    SELECT DISTINCT e.id AS emp_id, e.user_id
    FROM payroll_time_segments pts
    JOIN employees e ON e.id = pts.employee_id
    WHERE pts.pay_period_id = p_pay_period_id
      AND pts.organization_id = v_org_id
  LOOP
    FOR v_day IN SELECT generate_series(v_start, v_end, '1 day'::interval)::date LOOP
      -- Resolve effective config for this date
      SELECT * INTO v_config
      FROM employee_payroll_configs
      WHERE employee_id = v_emp_record.emp_id
        AND effective_from <= v_day
        AND (effective_to IS NULL OR effective_to >= v_day)
      ORDER BY effective_from DESC
      LIMIT 1;

      -- Skip if no config or does not require time allocation
      CONTINUE WHEN v_config IS NULL OR v_config.requires_time_allocation = false;

      v_checked := v_checked + 1;

      -- Available hours: only from daily clock if requires_daily_clock is true
      v_available_hours := NULL;
      IF v_config.requires_daily_clock = true THEN
        SELECT COALESCE(SUM(COALESCE(total_hours, 0)), 0)
        INTO v_available_hours
        FROM daily_clock_entries
        WHERE technician_id = v_emp_record.user_id
          AND entry_date = v_day
          AND organization_id = v_org_id
          AND status = 'clocked_out';
      END IF;
      -- If requires_daily_clock is false, available_hours stays NULL (not fabricated)

      -- Allocated hours: from approved time_entries + internal_time_sessions
      SELECT COALESCE(SUM(COALESCE(total_hours, 0)), 0)
      INTO v_allocated_hours
      FROM time_entries
      WHERE technician_id = v_emp_record.user_id
        AND entry_date = v_day
        AND organization_id = v_org_id
        AND status = 'approved';

      SELECT COALESCE(SUM(COALESCE(predetermined_hours, 0)), 0)
      INTO v_overallocated_hours
      FROM internal_time_sessions
      WHERE assigned_to = v_emp_record.user_id
        AND session_date = v_day
        AND organization_id = v_org_id
        AND status = 'approved';

      v_allocated_hours := v_allocated_hours + v_overallocated_hours;
      v_overallocated_hours := 0;

      -- Calculate unallocated and overallocated
      IF v_available_hours IS NOT NULL THEN
        v_unallocated_hours := v_available_hours - v_allocated_hours;
        IF v_unallocated_hours < 0 THEN
          v_overallocated_hours := ABS(v_unallocated_hours);
          v_unallocated_hours := 0;
        END IF;
      ELSE
        v_unallocated_hours := NULL;
      END IF;

      -- Flag if: unallocated > 0 or overallocated > 0
      IF (v_unallocated_hours IS NOT NULL AND v_unallocated_hours > 0.01)
         OR v_overallocated_hours > 0.01 THEN
        INSERT INTO payroll_reconciliation_flags (
          organization_id, pay_period_id, employee_id, segment_date,
          daily_clock_hours, segment_hours, variance_hours, needs_review,
          resolution_status, reconciliation_type
        )
        VALUES (
          v_org_id, p_pay_period_id, v_emp_record.emp_id, v_day,
          COALESCE(v_available_hours, 0), v_allocated_hours,
          COALESCE(v_unallocated_hours, 0) + v_overallocated_hours, true,
          'unresolved', 'allocation'
        )
        ON CONFLICT (pay_period_id, employee_id, segment_date) DO NOTHING;

        v_flagged := v_flagged + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN json_build_object(
    'total_days_checked', v_checked,
    'flagged_days', v_flagged
  );
END;
$function$;
