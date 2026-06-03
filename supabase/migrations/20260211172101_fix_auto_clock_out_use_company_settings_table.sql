/*
  # Fix Auto Clock-Out to Use Company Settings Table
  
  1. Issue
    - Previous migration added auto_clock_out_time to organizations table
    - But the system uses company_settings table for time clock settings
  
  2. Solution
    - Add auto_clock_out_time to company_settings table instead
    - Update function to read from company_settings
  
  3. Changes
    - Add auto_clock_out_time column to company_settings (default 16:00:00 = 4:00 PM)
    - Update auto_clock_out_forgotten_entries function to use company_settings
*/

-- Add auto_clock_out_time column to company_settings table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'company_settings' 
    AND column_name = 'auto_clock_out_time'
  ) THEN
    ALTER TABLE company_settings 
    ADD COLUMN auto_clock_out_time time DEFAULT '16:00:00'::time;
    
    COMMENT ON COLUMN company_settings.auto_clock_out_time IS 'Time to clock out users who forgot to clock out (default 4:00 PM)';
  END IF;
END $$;

-- Update the auto-clock-out function to read from company_settings
CREATE OR REPLACE FUNCTION auto_clock_out_forgotten_entries()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings record;
  v_cutoff_time time;
  v_clock_out_time time;
  v_cutoff_timestamp timestamptz;
  v_clock_out_timestamp timestamptz;
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
  v_clock_out_date date;
BEGIN
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
  v_clock_out_time := COALESCE(v_settings.auto_clock_out_time, '16:00:00'::time);
  v_penalty_points := COALESCE(v_settings.forgot_clock_out_penalty_points, -15);

  -- Determine the cutoff date for checking if user passed the deadline
  IF (now() AT TIME ZONE v_timezone)::time >= v_cutoff_time THEN
    v_cutoff_date := CURRENT_DATE;
    v_clock_out_date := CURRENT_DATE;
  ELSE
    v_cutoff_date := CURRENT_DATE - interval '1 day';
    v_clock_out_date := CURRENT_DATE - interval '1 day';
  END IF;

  -- Construct the cutoff timestamp (when we check if they forgot)
  v_cutoff_timestamp := (to_char(v_cutoff_date, 'YYYY-MM-DD') || ' ' || v_cutoff_time::text)::timestamp AT TIME ZONE v_timezone;
  
  -- Construct the clock-out timestamp (when we actually clock them out)
  v_clock_out_timestamp := (to_char(v_clock_out_date, 'YYYY-MM-DD') || ' ' || v_clock_out_time::text)::timestamp AT TIME ZONE v_timezone;

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
      clock_out = v_clock_out_timestamp,
      status = 'clocked_out',
      total_hours = EXTRACT(EPOCH FROM (v_clock_out_timestamp - dce.clock_in)) / 3600,
      deduct_points = true,
      points_deducted = v_penalty_points,
      auto_clocked_out = true,
      auto_clocked_out_at = now(),
      auto_clock_out_approved = false,
      notes = COALESCE(notes || E'\n', '') || 'Auto-clocked out at ' || to_char(v_clock_out_timestamp AT TIME ZONE v_timezone, 'YYYY-MM-DD HH12:MI:SS AM TZ') || ' (cutoff was ' || to_char(v_cutoff_timestamp AT TIME ZONE v_timezone, 'HH12:MI:SS AM') || '). Penalty: ' || v_penalty_points || ' points.'
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
    'clock_out_time', v_clock_out_time::text
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