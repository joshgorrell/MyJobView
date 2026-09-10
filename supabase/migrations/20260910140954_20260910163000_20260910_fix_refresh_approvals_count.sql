-- Fix: approvals_created count was inside the loop and only captured the last iteration.
-- Move the count to a single INSERT ... SELECT ... ON CONFLICT DO NOTHING approach.
CREATE OR REPLACE FUNCTION refresh_payroll_time(p_pay_period_id uuid)
RETURNS json AS $$
DECLARE
  v_org_id uuid;
  v_start date;
  v_end date;
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
  SELECT organization_id, period_start_date, period_end_date
  INTO v_org_id, v_start, v_end
  FROM pay_periods
  WHERE id = p_pay_period_id;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'pay period not found');
  END IF;

  -- 1. Regenerate unlocked segments
  v_seg_result := regenerate_payroll_segments(v_org_id, v_start, v_end);
  v_segments_count := COALESCE((v_seg_result->>'inserted_or_updated')::int, 0);

  -- 2. Assign segments to this pay period
  v_assign_result := assign_segments_to_pay_period(p_pay_period_id);

  -- 3. Run jurisdiction determination on all unlocked segments in this period
  FOR v_seg_id IN
    SELECT id FROM payroll_time_segments
    WHERE pay_period_id = p_pay_period_id
      AND organization_id = v_org_id
      AND is_locked = false
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

  -- 4. Auto-create missing payroll_approvals rows (single INSERT ... SELECT)
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
$$ LANGUAGE plpgsql SECURITY DEFINER;
