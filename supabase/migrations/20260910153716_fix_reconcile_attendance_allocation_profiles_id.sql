/*
# Fix reconcile_attendance and reconcile_allocation to use profiles.id for segment employee_id

## Purpose
payroll_time_segments.employee_id references profiles(id). The attendance and allocation
reconcile functions need to map from segment employee_id (profiles.id) to employees table
via employees.user_id = profiles.id.
*/
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

  DELETE FROM payroll_reconciliation_flags
  WHERE pay_period_id = p_pay_period_id
    AND reconciliation_type = 'attendance';

  -- Map segment employee_id (profiles.id) to employees via user_id
  FOR v_emp_record IN
    SELECT DISTINCT e.id AS emp_id, e.user_id
    FROM payroll_time_segments pts
    JOIN employees e ON e.user_id = pts.employee_id
    WHERE pts.pay_period_id = p_pay_period_id
      AND pts.organization_id = v_org_id
  LOOP
    FOR v_day IN SELECT generate_series(v_start, v_end, '1 day'::interval)::date LOOP
      SELECT * INTO v_config
      FROM employee_payroll_configs
      WHERE employee_id = v_emp_record.emp_id
        AND effective_from <= v_day
        AND (effective_to IS NULL OR effective_to >= v_day)
      ORDER BY effective_from DESC
      LIMIT 1;

      CONTINUE WHEN v_config IS NULL OR v_config.requires_daily_clock = false;

      v_day_name := btrim(to_char(v_day, 'day'));
      v_is_work_day := v_config.work_days IS NULL OR v_day_name = ANY(v_config.work_days);

      SELECT COUNT(*), COALESCE(SUM(COALESCE(total_hours, 0)), 0)
      INTO v_clock_count, v_clock_hours
      FROM daily_clock_entries
      WHERE technician_id = v_emp_record.user_id
        AND entry_date = v_day
        AND organization_id = v_org_id
        AND status = 'clocked_out';

      v_checked := v_checked + 1;

      v_expected_hours := 0;
      IF v_is_work_day AND v_config.standard_start_time IS NOT NULL AND v_config.standard_end_time IS NOT NULL THEN
        v_expected_hours := EXTRACT(EPOCH FROM (v_config.standard_end_time - v_config.standard_start_time)) / 3600;
      END IF;

      IF v_is_work_day AND v_clock_count = 0 THEN
        INSERT INTO payroll_reconciliation_flags (
          organization_id, pay_period_id, employee_id, segment_date,
          daily_clock_hours, segment_hours, variance_hours, needs_review,
          resolution_status, reconciliation_type
        )
        VALUES (
          v_org_id, p_pay_period_id, v_emp_record.user_id, v_day,
          0, 0, v_expected_hours, true,
          'unresolved', 'attendance'
        )
        ON CONFLICT (pay_period_id, employee_id, segment_date) DO NOTHING;

        v_flagged := v_flagged + 1;
      ELSIF v_is_work_day AND v_clock_hours > 0 AND v_expected_hours > 0 AND v_clock_hours < (v_expected_hours * 0.5) THEN
        v_variance := v_expected_hours - v_clock_hours;
        INSERT INTO payroll_reconciliation_flags (
          organization_id, pay_period_id, employee_id, segment_date,
          daily_clock_hours, segment_hours, variance_hours, needs_review,
          resolution_status, reconciliation_type
        )
        VALUES (
          v_org_id, p_pay_period_id, v_emp_record.user_id, v_day,
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

  DELETE FROM payroll_reconciliation_flags
  WHERE pay_period_id = p_pay_period_id
    AND reconciliation_type = 'allocation';

  FOR v_emp_record IN
    SELECT DISTINCT e.id AS emp_id, e.user_id
    FROM payroll_time_segments pts
    JOIN employees e ON e.user_id = pts.employee_id
    WHERE pts.pay_period_id = p_pay_period_id
      AND pts.organization_id = v_org_id
  LOOP
    FOR v_day IN SELECT generate_series(v_start, v_end, '1 day'::interval)::date LOOP
      SELECT * INTO v_config
      FROM employee_payroll_configs
      WHERE employee_id = v_emp_record.emp_id
        AND effective_from <= v_day
        AND (effective_to IS NULL OR effective_to >= v_day)
      ORDER BY effective_from DESC
      LIMIT 1;

      CONTINUE WHEN v_config IS NULL OR v_config.requires_time_allocation = false;

      v_checked := v_checked + 1;

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

      IF v_available_hours IS NOT NULL THEN
        v_unallocated_hours := v_available_hours - v_allocated_hours;
        IF v_unallocated_hours < 0 THEN
          v_overallocated_hours := ABS(v_unallocated_hours);
          v_unallocated_hours := 0;
        END IF;
      ELSE
        v_unallocated_hours := NULL;
      END IF;

      IF (v_unallocated_hours IS NOT NULL AND v_unallocated_hours > 0.01)
         OR v_overallocated_hours > 0.01 THEN
        INSERT INTO payroll_reconciliation_flags (
          organization_id, pay_period_id, employee_id, segment_date,
          daily_clock_hours, segment_hours, variance_hours, needs_review,
          resolution_status, reconciliation_type
        )
        VALUES (
          v_org_id, p_pay_period_id, v_emp_record.user_id, v_day,
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
