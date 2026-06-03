/*
  # Fix Auto Clock-Out - Add Organization ID to Notifications
  
  1. Issue
    - Notifications table requires organization_id
    - Auto clock-out function wasn't setting it
  
  2. Fix
    - Add organization_id to notification inserts
*/

CREATE OR REPLACE FUNCTION auto_clock_out_forgotten_entries()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings record;
  v_cutoff_time time;
  v_cutoff_timestamp timestamptz;
  v_penalty_points integer;
  v_affected_count integer := 0;
  v_execution_start timestamptz := clock_timestamp();
  v_execution_log_id uuid;
  v_entry_ids uuid[] := '{}';
  v_tech_ids uuid[] := '{}';
  v_tech_names text[] := '{}';
  v_total_points integer := 0;
  v_admin_ids uuid[] := '{}';
  v_notification_ids uuid[] := '{}';
  v_notification_id uuid;
  v_admin_id uuid;
  v_execution_duration integer;
  v_timezone text;
  v_org_id uuid;
  v_cutoff_date date;
BEGIN
  SELECT 
    id,
    auto_clock_out_enabled,
    auto_clock_out_cutoff_time,
    forgot_clock_out_penalty_points,
    home_clock_notification_roles,
    COALESCE(timezone, 'America/Chicago') as tz
  INTO v_settings
  FROM organizations
  LIMIT 1;

  IF v_settings IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'No organization settings found',
      'entries_processed', 0
    );
  END IF;

  v_org_id := v_settings.id;
  v_timezone := v_settings.tz;

  IF NOT v_settings.auto_clock_out_enabled THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Auto clock-out is not enabled',
      'entries_processed', 0
    );
  END IF;

  v_cutoff_time := COALESCE(v_settings.auto_clock_out_cutoff_time, '22:00:00'::time);
  v_penalty_points := COALESCE(v_settings.forgot_clock_out_penalty_points, -15);

  -- Determine the cutoff date
  IF (now() AT TIME ZONE v_timezone)::time >= v_cutoff_time THEN
    v_cutoff_date := CURRENT_DATE;
  ELSE
    v_cutoff_date := CURRENT_DATE - interval '1 day';
  END IF;

  -- Construct the cutoff timestamp properly
  v_cutoff_timestamp := (to_char(v_cutoff_date, 'YYYY-MM-DD') || ' ' || v_cutoff_time::text)::timestamp AT TIME ZONE v_timezone;

  WITH entries_to_process AS (
    SELECT 
      dce.id,
      dce.technician_id,
      dce.clock_in,
      p.full_name,
      p.requires_daily_clock
    FROM daily_clock_entries dce
    JOIN profiles p ON p.id = dce.technician_id
    WHERE dce.status = 'clocked_in'
      AND dce.clock_in < v_cutoff_timestamp
      AND p.requires_daily_clock = true
      AND dce.auto_clocked_out = false
  ),
  updated_entries AS (
    UPDATE daily_clock_entries dce
    SET 
      clock_out = v_cutoff_timestamp,
      status = 'clocked_out',
      total_hours = EXTRACT(EPOCH FROM (v_cutoff_timestamp - dce.clock_in)) / 3600,
      deduct_points = true,
      points_deducted = v_penalty_points,
      auto_clocked_out = true,
      auto_clocked_out_at = now(),
      auto_clock_out_approved = false,
      notes = COALESCE(notes || E'\n', '') || 'Auto-clocked out at ' || to_char(v_cutoff_timestamp AT TIME ZONE v_timezone, 'YYYY-MM-DD HH12:MI:SS AM TZ') || ' due to forgotten clock-out. Penalty: ' || v_penalty_points || ' points.'
    FROM entries_to_process etp
    WHERE dce.id = etp.id
    RETURNING dce.id, dce.technician_id, dce.points_deducted, etp.full_name
  )
  SELECT 
    array_agg(id),
    array_agg(DISTINCT technician_id),
    array_agg(DISTINCT full_name),
    SUM(ABS(points_deducted))::integer
  INTO 
    v_entry_ids,
    v_tech_ids,
    v_tech_names,
    v_total_points
  FROM updated_entries;

  v_affected_count := COALESCE(array_length(v_entry_ids, 1), 0);

  IF v_affected_count > 0 THEN
    FOR i IN 1..array_length(v_tech_ids, 1) LOOP
      -- Call award_points with correct 3-parameter signature
      PERFORM award_points(
        v_tech_ids[i],
        v_penalty_points,
        'Automatic clock-out penalty for forgotten clock-out on ' || to_char(CURRENT_DATE, 'YYYY-MM-DD')
      );
    END LOOP;

    IF v_settings.home_clock_notification_roles IS NOT NULL AND array_length(v_settings.home_clock_notification_roles, 1) > 0 THEN
      SELECT array_agg(DISTINCT id)
      INTO v_admin_ids
      FROM profiles
      WHERE role = ANY(v_settings.home_clock_notification_roles);
    ELSE
      SELECT array_agg(DISTINCT id)
      INTO v_admin_ids
      FROM profiles
      WHERE role IN ('admin', 'owner');
    END IF;

    IF v_admin_ids IS NOT NULL THEN
      FOREACH v_admin_id IN ARRAY v_admin_ids LOOP
        INSERT INTO notifications (
          user_id,
          organization_id,
          type,
          title,
          body,
          related_id
        ) VALUES (
          v_admin_id,
          v_org_id,
          'auto_clock_out_completed',
          'Auto Clock-Out: Needs Approval',
          v_affected_count || ' technician(s) were automatically clocked out and need approval before payroll. Click to review.',
          NULL
        )
        RETURNING id INTO v_notification_id;
        
        v_notification_ids := array_append(v_notification_ids, v_notification_id);
      END LOOP;
    END IF;
  END IF;

  v_execution_duration := EXTRACT(EPOCH FROM (clock_timestamp() - v_execution_start)) * 1000;

  INSERT INTO auto_clock_out_execution_log (
    organization_id,
    executed_at,
    entries_processed,
    entry_ids,
    technician_ids,
    technician_names,
    total_points_deducted,
    admin_notified,
    admin_notification_ids,
    success,
    execution_duration_ms
  ) VALUES (
    v_org_id,
    v_execution_start,
    v_affected_count,
    v_entry_ids,
    v_tech_ids,
    v_tech_names,
    v_total_points,
    v_admin_ids IS NOT NULL,
    v_notification_ids,
    true,
    v_execution_duration
  )
  RETURNING id INTO v_execution_log_id;

  UPDATE organizations
  SET last_auto_clock_out_run = v_execution_start
  WHERE id = v_org_id;

  RETURN jsonb_build_object(
    'success', true,
    'execution_log_id', v_execution_log_id,
    'entries_processed', v_affected_count,
    'technician_ids', v_tech_ids,
    'technician_names', v_tech_names,
    'total_points_deducted', v_total_points,
    'admin_notified', v_admin_ids IS NOT NULL,
    'notification_count', COALESCE(array_length(v_notification_ids, 1), 0),
    'executed_at', v_execution_start,
    'execution_duration_ms', v_execution_duration
  );

EXCEPTION
  WHEN OTHERS THEN
    INSERT INTO auto_clock_out_execution_log (
      organization_id,
      executed_at,
      entries_processed,
      success,
      error_message
    ) VALUES (
      v_org_id,
      v_execution_start,
      0,
      false,
      SQLERRM
    );

    RETURN jsonb_build_object(
      'success', false,
      'message', 'Error: ' || SQLERRM,
      'entries_processed', 0
    );
END;
$$;
