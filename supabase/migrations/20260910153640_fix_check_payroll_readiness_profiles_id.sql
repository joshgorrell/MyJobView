/*
# Fix reconcile and readiness functions to use profiles.id for segment employee_id

## Purpose
payroll_time_segments.employee_id references profiles(id), not employees(id).
The reconcile functions need to JOIN through employees to get the user_id for
comparing against daily_clock_entries.technician_id and time_entries.technician_id.

## Fixes
1. reconcile_payroll_segments: already uses subquery to get user_id from employees - OK
2. check_payroll_readiness: needs to JOIN employees to get user_id for activity check
3. reconcile_attendance: already uses e.user_id - OK
4. reconcile_allocation: already uses e.user_id - OK

The main fix is in check_payroll_readiness where it looks for pending_adjustments.
*/
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
BEGIN
  SELECT organization_id, period_start_date, period_end_date, pay_schedule_id
  INTO v_org_id, v_start, v_end, v_pay_schedule_id
  FROM pay_periods
  WHERE id = p_pay_period_id;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'pay period not found');
  END IF;

  -- Count distinct employees (profiles.id) with segments in this period
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

  -- Segments with GPS/job mismatches
  SELECT COUNT(*) INTO v_gps_mismatches
  FROM payroll_time_segments
  WHERE pay_period_id = p_pay_period_id
    AND organization_id = v_org_id
    AND work_jurisdiction_confidence = 'low';

  -- Pending time adjustments for employees in this period
  -- employee_id in payroll_time_segments is profiles.id, which is the same as technician_id
  SELECT COUNT(*) INTO v_pending_adjustments
  FROM time_adjustment_requests tar
  WHERE tar.organization_id = v_org_id
    AND tar.status = 'pending'
    AND tar.technician_id IN (
      SELECT DISTINCT pts.employee_id
      FROM payroll_time_segments pts
      WHERE pts.pay_period_id = p_pay_period_id
    );

  -- Total segments
  SELECT COUNT(*) INTO v_total_segments
  FROM payroll_time_segments
  WHERE pay_period_id = p_pay_period_id
    AND organization_id = v_org_id;

  -- Check for unreviewed employee_payroll_configs
  -- Need to map segment employee_id (profiles.id) to employees.id
  v_unreviewed_configs := 0;
  FOR v_emp_id IN
    SELECT DISTINCT e.id
    FROM payroll_time_segments pts
    JOIN employees e ON e.user_id = pts.employee_id
    WHERE pts.pay_period_id = p_pay_period_id
      AND pts.organization_id = v_org_id
  LOOP
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
