/*
# Fix reconcile_payroll_segments to use profiles.id for segment employee_id

## Purpose
payroll_time_segments.employee_id references profiles(id). The reconcile function
needs to map from the segment's employee_id (profiles.id) to the employees table
via employees.user_id = profiles.id.
*/
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
  v_user_id uuid;
BEGIN
  SELECT organization_id, period_start_date, period_end_date
  INTO v_org_id, v_start, v_end
  FROM pay_periods
  WHERE id = p_pay_period_id;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'pay period not found');
  END IF;

  -- Delete existing payroll-type reconciliation flags for this period
  DELETE FROM payroll_reconciliation_flags
  WHERE pay_period_id = p_pay_period_id
    AND reconciliation_type = 'payroll';

  -- Get all employees (profiles.id) with segments in this period
  -- Map to employees table via user_id
  FOR v_emp_record IN
    SELECT DISTINCT pts.employee_id AS profile_id, e.id AS emp_id, e.user_id
    FROM payroll_time_segments pts
    JOIN employees e ON e.user_id = pts.employee_id
    WHERE pts.pay_period_id = p_pay_period_id
      AND pts.organization_id = v_org_id
  LOOP
    FOR v_day IN SELECT DISTINCT segment_date FROM payroll_time_segments WHERE pay_period_id = p_pay_period_id AND employee_id = v_emp_record.profile_id ORDER BY segment_date LOOP
      -- Resolve effective config for this date
      SELECT * INTO v_config
      FROM employee_payroll_configs
      WHERE employee_id = v_emp_record.emp_id
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
      WHERE employee_id = v_emp_record.profile_id
        AND segment_date = v_day
        AND pay_period_id = p_pay_period_id
        AND organization_id = v_org_id;

      -- Determine source hours based on payroll_time_basis
      IF v_config IS NULL THEN
        v_source_hours := 0;
        v_exclusion_reason := 'No effective payroll configuration found';
      ELSIF v_config.payroll_time_basis = 'salary' THEN
        v_source_hours := 0;
        IF v_seg_hours > 0 THEN
          v_excluded_hours := v_seg_hours;
          v_exclusion_reason := 'Salary employee should not have hourly segments';
        END IF;
      ELSIF v_config.payroll_time_basis = 'daily_clock' THEN
        SELECT COALESCE(SUM(COALESCE(total_hours, 0)), 0)
        INTO v_source_hours
        FROM daily_clock_entries
        WHERE technician_id = v_emp_record.user_id
          AND entry_date = v_day
          AND organization_id = v_org_id
          AND status = 'clocked_out';
      ELSIF v_config.payroll_time_basis = 'work_allocation' THEN
        SELECT COALESCE(SUM(COALESCE(total_hours, 0)), 0)
        INTO v_source_hours
        FROM time_entries
        WHERE technician_id = v_emp_record.user_id
          AND entry_date = v_day
          AND organization_id = v_org_id
          AND status = 'approved';

        SELECT COALESCE(SUM(COALESCE(predetermined_hours, 0)), 0)
        INTO v_allocation_hours
        FROM internal_time_sessions
        WHERE assigned_to = v_emp_record.user_id
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
        v_org_id, p_pay_period_id, v_emp_record.profile_id, v_day,
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
