/*
# Fix regenerate_payroll_segments to use profiles.id for segment employee_id

## Purpose
The payroll_time_segments.employee_id FK references profiles(id), not employees(id).
This is the transitional architecture — segments still reference profiles.
The function was incorrectly inserting employees.id as employee_id.

## Changes
- Replace v_emp_record.emp_id with v_emp_record.user_id in all INSERT statements for payroll_time_segments
- The employee_id in payroll_time_segments must be the profiles.id (user_id from employees table)
*/
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
  FOR v_emp_record IN
    SELECT DISTINCT e.id AS emp_id, e.user_id
    FROM employees e
    WHERE e.organization_id = p_organization_id
  LOOP
    FOR v_seg_date IN SELECT generate_series(p_start_date, p_end_date, '1 day'::interval)::date LOOP
      SELECT * INTO v_config
      FROM employee_payroll_configs
      WHERE employee_id = v_emp_record.emp_id
        AND effective_from <= v_seg_date
        AND (effective_to IS NULL OR effective_to >= v_seg_date)
      ORDER BY effective_from DESC
      LIMIT 1;

      CONTINUE WHEN v_config IS NULL;

      IF v_config.payroll_time_basis = 'daily_clock' THEN
        INSERT INTO payroll_time_segments (
          organization_id, employee_id, segment_date, start_time, end_time,
          total_hours, break_minutes, time_type, source_table, source_record_id,
          segment_key, segment_sequence, daily_clock_entry_id,
          physical_work_location_state, gps_validated
        )
        SELECT
          p_organization_id,
          v_emp_record.user_id,
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
            v_seg_key := 'pto:' || v_emp_record.user_id::text || ':' || v_seg_date::text;
            INSERT INTO payroll_time_segments (
              organization_id, employee_id, segment_date, start_time, end_time,
              total_hours, time_type, source_table, source_record_id,
              segment_key, segment_sequence
            )
            VALUES (
              p_organization_id,
              v_emp_record.user_id,
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
        INSERT INTO payroll_time_segments (
          organization_id, employee_id, segment_date, start_time, end_time,
          total_hours, break_minutes, time_type, source_table, source_record_id,
          segment_key, segment_sequence, work_order_id, project_id,
          labor_phase_id, overtime_hours, physical_work_location_state,
          physical_work_lat, physical_work_lng, gps_validated
        )
        SELECT
          te.organization_id,
          v_emp_record.user_id,
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

        INSERT INTO payroll_time_segments (
          organization_id, employee_id, segment_date, start_time, end_time,
          total_hours, time_type, source_table, source_record_id,
          segment_key, segment_sequence
        )
        SELECT
          its.organization_id,
          v_emp_record.user_id,
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
            v_seg_key := 'pto:' || v_emp_record.user_id::text || ':' || v_seg_date::text;
            INSERT INTO payroll_time_segments (
              organization_id, employee_id, segment_date, start_time, end_time,
              total_hours, time_type, source_table, source_record_id,
              segment_key, segment_sequence
            )
            VALUES (
              p_organization_id,
              v_emp_record.user_id,
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
