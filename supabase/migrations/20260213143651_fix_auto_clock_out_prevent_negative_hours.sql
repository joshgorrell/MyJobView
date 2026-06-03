/*
  # Fix Auto Clock-Out to Prevent Negative Hours

  1. Issue
    - Auto clock-out uses fixed clock_out_time (e.g., 4 PM)
    - If employee clocks in after 4 PM (e.g., 7 PM), auto clock-out creates negative hours
    - Example: Clock in 7:22 PM, clock out 5 PM = -2.38 hours (WRONG!)

  2. Solution
    - Check if proposed clock_out_time is BEFORE clock_in time
    - If so, add 1 day to clock_out (overnight shift)
    - This ensures clock_out is always AFTER clock_in
    - Respects employee's standard_end_time if available

  3. Changes
    - Update auto_clock_out_forgotten_entries function
    - Calculate clock_out_timestamp per entry, not globally
    - Add validation to ensure no negative hours

  4. Notes
    - Prevents the timezone bug from creating invalid data
    - Works correctly for overnight shifts
    - Uses org timezone for all calculations
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
  v_default_clock_out_time time;
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
  -- Get company settings including timezone
  SELECT 
    organization_id,
    auto_clock_out_enabled,
    auto_clock_out_cutoff_time,
    auto_clock_out_time,
    forgot_clock_out_penalty_points,
    home_clock_notification_roles,
    COALESCE(timezone, 'America/Chicago') as tz
  INTO v_settings
  FROM company_settings
  LIMIT 1;

  IF v_settings IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'No company settings found',
      'entries_processed', 0
    );
  END IF;

  v_org_id := v_settings.organization_id;
  v_timezone := v_settings.tz;

  IF NOT v_settings.auto_clock_out_enabled THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Auto clock-out is not enabled',
      'entries_processed', 0
    );
  END IF;

  v_cutoff_time := COALESCE(v_settings.auto_clock_out_cutoff_time, '22:00:00'::time);
  v_default_clock_out_time := COALESCE(v_settings.auto_clock_out_time, '16:00:00'::time);
  v_penalty_points := COALESCE(v_settings.forgot_clock_out_penalty_points, -15);

  -- Determine the cutoff date for checking if user passed the deadline
  IF (now() AT TIME ZONE v_timezone)::time >= v_cutoff_time THEN
    v_cutoff_date := CURRENT_DATE;
  ELSE
    v_cutoff_date := CURRENT_DATE - interval '1 day';
  END IF;

  -- Construct the cutoff timestamp (when we check if they forgot)
  v_cutoff_timestamp := (to_char(v_cutoff_date, 'YYYY-MM-DD') || ' ' || v_cutoff_time::text)::timestamp AT TIME ZONE v_timezone;

  -- Process entries with smart clock-out time calculation
  WITH entries_to_process AS (
    SELECT 
      dce.id,
      dce.technician_id,
      dce.clock_in,
      dce.entry_date,
      p.full_name,
      p.requires_daily_clock,
      p.standard_end_time,
      -- Calculate appropriate clock_out timestamp
      CASE
        -- Use employee's standard end time if available
        WHEN p.standard_end_time IS NOT NULL THEN
          CASE
            -- If standard end time is AFTER clock_in time on same day, use it
            WHEN (dce.entry_date || ' ' || p.standard_end_time::text)::timestamp AT TIME ZONE v_timezone > dce.clock_in
            THEN (dce.entry_date || ' ' || p.standard_end_time::text)::timestamp AT TIME ZONE v_timezone
            -- Otherwise, use next day (overnight shift)
            ELSE (dce.entry_date + interval '1 day' || ' ' || p.standard_end_time::text)::timestamp AT TIME ZONE v_timezone
          END
        -- Use default clock out time
        ELSE
          CASE
            -- If default time is AFTER clock_in time on same day, use it
            WHEN (dce.entry_date || ' ' || v_default_clock_out_time::text)::timestamp AT TIME ZONE v_timezone > dce.clock_in
            THEN (dce.entry_date || ' ' || v_default_clock_out_time::text)::timestamp AT TIME ZONE v_timezone
            -- Otherwise, use next day (overnight shift)
            ELSE (dce.entry_date + interval '1 day' || ' ' || v_default_clock_out_time::text)::timestamp AT TIME ZONE v_timezone
          END
      END as calculated_clock_out
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
      clock_out = etp.calculated_clock_out,
      status = 'clocked_out',
      total_hours = EXTRACT(EPOCH FROM (etp.calculated_clock_out - dce.clock_in)) / 3600,
      deduct_points = true,
      points_deducted = v_penalty_points,
      auto_clocked_out = true,
      auto_clocked_out_at = now(),
      auto_clock_out_approved = false,
      notes = COALESCE(notes || E'\n', '') || 'Auto-clocked out at ' || to_char(etp.calculated_clock_out AT TIME ZONE v_timezone, 'YYYY-MM-DD HH12:MI:SS AM TZ') || ' (cutoff was ' || to_char(v_cutoff_timestamp AT TIME ZONE v_timezone, 'HH12:MI:SS AM') || '). Penalty: ' || v_penalty_points || ' points.'
    FROM entries_to_process etp
    WHERE dce.id = etp.id
      -- Extra safety: ensure we're not creating negative hours
      AND etp.calculated_clock_out > dce.clock_in
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

  -- Award penalty points
  IF v_affected_count > 0 THEN
    FOR i IN 1..array_length(v_tech_ids, 1) LOOP
      PERFORM award_points(
        v_tech_ids[i],
        v_penalty_points,
        'Automatic clock-out penalty for forgotten clock-out on ' || to_char(CURRENT_DATE, 'YYYY-MM-DD')
      );
    END LOOP;

    -- Notify admins
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
          'auto_clock_out',
          'Auto Clock-Out: Needs Approval',
          v_affected_count || ' technician(s) were automatically clocked out and need approval before payroll. Click to review.',
          NULL
        )
        RETURNING id INTO v_notification_id;
        
        v_notification_ids := array_append(v_notification_ids, v_notification_id);
      END LOOP;
    END IF;
  END IF;

  -- Log execution
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

  UPDATE company_settings
  SET last_auto_clock_out_run = v_execution_start;

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
    'execution_duration_ms', v_execution_duration,
    'cutoff_time', v_cutoff_time::text,
    'default_clock_out_time', v_default_clock_out_time::text,
    'timezone', v_timezone
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
