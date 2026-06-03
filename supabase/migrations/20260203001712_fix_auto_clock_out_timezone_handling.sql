/*
  # Fix Auto Clock-Out Timezone Handling
  
  1. Issue
    - Auto clock-out times are being interpreted as UTC instead of local time
    - Example: 5pm local time is stored as 17:00:00, but interpreted as 17:00 UTC
    - This causes displays like "11am" in Central Time (UTC-6)
  
  2. Changes
    - Add timezone column to company_settings (defaults to 'America/Chicago')
    - Update auto_clock_out_forgotten_entries() function to use local timezone
    - Update entries_pending_auto_clock_out view to use local timezone
    
  3. Security
    - No RLS changes needed (same permissions apply)
*/

-- Add timezone setting to company_settings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'timezone'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN timezone text DEFAULT 'America/Chicago';
    COMMENT ON COLUMN company_settings.timezone IS 
      'Company timezone (e.g., America/Chicago, America/New_York, America/Los_Angeles)';
  END IF;
END $$;

-- Drop and recreate the view with proper timezone handling
DROP VIEW IF EXISTS entries_pending_auto_clock_out;

CREATE VIEW entries_pending_auto_clock_out AS
SELECT 
  dce.id,
  dce.technician_id,
  p.full_name,
  p.email,
  dce.entry_date,
  dce.clock_in,
  (
    (dce.entry_date || ' ' || COALESCE(p.standard_end_time, cs.business_day_end_time)::text)::timestamp 
    AT TIME ZONE cs.timezone
  ) as will_clock_out_at,
  EXTRACT(EPOCH FROM (NOW() - dce.clock_in)) / 3600 as hours_since_clock_in
FROM daily_clock_entries dce
JOIN profiles p ON p.id = dce.technician_id
CROSS JOIN company_settings cs
WHERE dce.status = 'clocked_in'
  AND dce.entry_date < CURRENT_DATE
  AND cs.auto_clock_out_enabled = true
ORDER BY dce.entry_date, dce.clock_in;

GRANT SELECT ON entries_pending_auto_clock_out TO authenticated;

COMMENT ON VIEW entries_pending_auto_clock_out IS 
  'Shows users who are still clocked in from previous days and are pending auto clock-out. Times are in company local timezone.';

-- Update auto_clock_out_forgotten_entries function to use timezone
CREATE OR REPLACE FUNCTION auto_clock_out_forgotten_entries()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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
BEGIN
  -- Get auto clock-out settings
  SELECT 
    auto_clock_out_enabled,
    auto_clock_out_cutoff_time,
    forgot_clock_out_penalty_points,
    home_clock_notification_roles,
    COALESCE(timezone, 'America/Chicago') as tz
  INTO v_settings
  FROM company_settings
  LIMIT 1;

  v_timezone := v_settings.tz;

  -- Check if auto clock-out is enabled
  IF NOT v_settings.auto_clock_out_enabled THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Auto clock-out is not enabled',
      'entries_processed', 0
    );
  END IF;

  v_cutoff_time := COALESCE(v_settings.auto_clock_out_cutoff_time, '22:00:00'::time);
  v_penalty_points := COALESCE(v_settings.forgot_clock_out_penalty_points, -15);

  -- Calculate cutoff timestamp in local timezone
  -- If current time (in local TZ) >= cutoff time, use today at cutoff time
  -- Otherwise use yesterday at cutoff time
  IF (now() AT TIME ZONE v_timezone)::time >= v_cutoff_time THEN
    v_cutoff_timestamp := ((CURRENT_DATE || ' ' || v_cutoff_time::text)::timestamp AT TIME ZONE v_timezone);
  ELSE
    v_cutoff_timestamp := (((CURRENT_DATE - interval '1 day') || ' ' || v_cutoff_time::text)::timestamp AT TIME ZONE v_timezone);
  END IF;

  -- Process forgotten entries
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

  -- Award penalty points
  IF v_affected_count > 0 THEN
    FOR i IN 1..array_length(v_tech_ids, 1) LOOP
      PERFORM award_points(
        v_tech_ids[i],
        v_penalty_points,
        'auto_clock_out_penalty',
        'Automatic clock-out penalty for forgotten clock-out on ' || to_char(CURRENT_DATE, 'YYYY-MM-DD')
      );
    END LOOP;

    -- Get admin IDs based on home_clock_notification_roles
    IF v_settings.home_clock_notification_roles IS NOT NULL AND array_length(v_settings.home_clock_notification_roles, 1) > 0 THEN
      SELECT array_agg(DISTINCT id)
      INTO v_admin_ids
      FROM profiles
      WHERE role = ANY(v_settings.home_clock_notification_roles);
    ELSE
      -- Default to admin and owner roles
      SELECT array_agg(DISTINCT id)
      INTO v_admin_ids
      FROM profiles
      WHERE role IN ('admin', 'owner');
    END IF;

    -- Create notifications for admins
    IF v_admin_ids IS NOT NULL THEN
      FOREACH v_admin_id IN ARRAY v_admin_ids LOOP
        INSERT INTO notifications (
          user_id,
          type,
          title,
          message,
          priority,
          related_id
        ) VALUES (
          v_admin_id,
          'auto_clock_out_completed',
          'Auto Clock-Out Completed',
          v_affected_count || ' technician(s) were automatically clocked out. Total points deducted: ' || v_total_points || '. Click to review.',
          'normal',
          NULL
        )
        RETURNING id INTO v_notification_id;
        
        v_notification_ids := array_append(v_notification_ids, v_notification_id);
      END LOOP;
    END IF;
  END IF;

  -- Calculate execution duration
  v_execution_duration := EXTRACT(EPOCH FROM (clock_timestamp() - v_execution_start)) * 1000;

  -- Log execution
  INSERT INTO auto_clock_out_execution_log (
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

  -- Update last run timestamp
  UPDATE company_settings
  SET last_auto_clock_out_run = v_execution_start;

  -- Return execution summary
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
    -- Log failed execution
    INSERT INTO auto_clock_out_execution_log (
      executed_at,
      entries_processed,
      success,
      error_message
    ) VALUES (
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
