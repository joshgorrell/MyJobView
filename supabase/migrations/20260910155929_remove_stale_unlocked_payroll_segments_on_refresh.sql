/* Remove stale unlocked generated segments before regeneration. Locked payroll history remains untouched. */
CREATE OR REPLACE FUNCTION public.refresh_payroll_time(p_pay_period_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id uuid; v_start date; v_end date; v_status text;
  v_seg_result json; v_assign_result json; v_segments_count int := 0;
  v_jur_high int := 0; v_jur_medium int := 0; v_jur_low int := 0; v_jur_unassigned int := 0;
  v_approvals_created int := 0; v_recon_result json; v_refreshed_at timestamptz := now();
  v_seg_id uuid; v_jur_result json;
BEGIN
  SELECT organization_id, period_start_date, period_end_date, status INTO v_org_id, v_start, v_end, v_status FROM pay_periods WHERE id = p_pay_period_id;
  IF NOT FOUND THEN RETURN json_build_object('error', 'pay period not found'); END IF;
  IF v_status IN ('payroll_approved', 'submitted', 'processed', 'locked') THEN RETURN json_build_object('error', 'Cannot refresh payroll time for a period with status: ' || v_status); END IF;

  DELETE FROM payroll_time_segments pts
  WHERE pts.organization_id = v_org_id
    AND pts.pay_period_id = p_pay_period_id
    AND pts.is_locked = false
    AND (
      (pts.source_table = 'daily_clock_entries' AND NOT EXISTS (SELECT 1 FROM daily_clock_entries d WHERE d.id = pts.source_record_id))
      OR (pts.source_table = 'time_entries' AND NOT EXISTS (SELECT 1 FROM time_entries t WHERE t.id = pts.source_record_id))
      OR (pts.source_table = 'internal_time_sessions' AND NOT EXISTS (SELECT 1 FROM internal_time_sessions s WHERE s.id = pts.source_record_id))
    );

  v_seg_result := regenerate_payroll_segments(v_org_id, v_start, v_end);
  v_segments_count := COALESCE((v_seg_result->>'inserted_or_updated')::int, 0);
  v_assign_result := assign_segments_to_pay_period(p_pay_period_id);

  FOR v_seg_id IN SELECT id FROM payroll_time_segments WHERE pay_period_id = p_pay_period_id AND organization_id = v_org_id AND is_locked = false AND work_jurisdiction_source != 'manual_override' LOOP
    v_jur_result := determine_segment_jurisdiction(v_seg_id);
    UPDATE payroll_time_segments SET work_jurisdiction_state = (v_jur_result->>'jurisdiction_state')::text, work_jurisdiction_source = (v_jur_result->>'jurisdiction_source')::text, work_jurisdiction_confidence = (v_jur_result->>'confidence')::text, gps_validated = (v_jur_result->>'gps_validated')::boolean WHERE id = v_seg_id;
    IF (v_jur_result->>'confidence') = 'high' THEN v_jur_high := v_jur_high + 1;
    ELSIF (v_jur_result->>'confidence') = 'medium' THEN v_jur_medium := v_jur_medium + 1;
    ELSIF (v_jur_result->>'confidence') = 'low' THEN v_jur_low := v_jur_low + 1;
    ELSIF (v_jur_result->>'confidence') = 'unassigned' THEN v_jur_unassigned := v_jur_unassigned + 1; END IF;
  END LOOP;

  INSERT INTO payroll_approvals (organization_id, pay_period_id, employee_id, approval_status)
  SELECT v_org_id, p_pay_period_id, pts.employee_id, 'pending'
  FROM (SELECT DISTINCT employee_id FROM payroll_time_segments WHERE pay_period_id = p_pay_period_id AND organization_id = v_org_id) pts
  ON CONFLICT (pay_period_id, employee_id) DO NOTHING;
  GET DIAGNOSTICS v_approvals_created = ROW_COUNT;

  v_recon_result := reconcile_payroll_segments(p_pay_period_id);
  UPDATE pay_periods SET last_refresh_at = v_refreshed_at, last_segment_count = v_segments_count WHERE id = p_pay_period_id;

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
