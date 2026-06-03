/*
  # Fix Auto Clock Out Function - Notifications Compatibility

  1. Changes
    - Update auto_clock_out_forgotten_entries function to use correct notification fields
    - Remove reference_id and reference_type (don't exist in notifications table)
    - Use related_id instead if it exists, or remove entirely
*/

CREATE OR REPLACE FUNCTION auto_clock_out_forgotten_entries()
RETURNS TABLE(
  entries_processed integer,
  technician_ids uuid[],
  entry_ids uuid[]
) AS $$
DECLARE
  v_settings record;
  v_entry record;
  v_clock_out_time timestamptz;
  v_entries_count integer := 0;
  v_tech_ids uuid[] := ARRAY[]::uuid[];
  v_entry_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  -- Get company settings
  SELECT 
    auto_clock_out_enabled,
    forgot_clock_out_penalty_points,
    business_day_end_time
  INTO v_settings
  FROM company_settings
  LIMIT 1;

  -- If auto clock-out is disabled, return early
  IF NOT COALESCE(v_settings.auto_clock_out_enabled, true) THEN
    RETURN QUERY SELECT 0, ARRAY[]::uuid[], ARRAY[]::uuid[];
    RETURN;
  END IF;

  -- Find all entries from previous days that are still clocked_in
  FOR v_entry IN
    SELECT 
      dce.id,
      dce.technician_id,
      dce.entry_date,
      dce.clock_in,
      p.standard_end_time,
      p.full_name
    FROM daily_clock_entries dce
    JOIN profiles p ON p.id = dce.technician_id
    WHERE dce.status = 'clocked_in'
    AND dce.entry_date < CURRENT_DATE
  LOOP
    -- Calculate the clock-out time (use their standard end time or business day end time)
    v_clock_out_time := (v_entry.entry_date || ' ' || 
      COALESCE(v_entry.standard_end_time, v_settings.business_day_end_time)::text
    )::timestamptz;

    -- Update the clock entry
    UPDATE daily_clock_entries
    SET 
      clock_out = v_clock_out_time,
      status = 'clocked_out',
      admin_adjusted = true,
      adjustment_reason = 'Auto-clocked out: User forgot to clock out'
    WHERE id = v_entry.id;

    -- Create reward log entry with penalty
    INSERT INTO clock_in_rewards_log (
      technician_id,
      daily_clock_entry_id,
      event_type,
      points_awarded,
      minutes_delta,
      scheduled_time,
      actual_time
    ) VALUES (
      v_entry.technician_id,
      v_entry.id,
      'forgot_clock_out',
      COALESCE(v_settings.forgot_clock_out_penalty_points, -15),
      NULL,
      NULL,
      NULL
    );

    -- Apply points penalty
    UPDATE profiles
    SET points_earned = COALESCE(points_earned, 0) + COALESCE(v_settings.forgot_clock_out_penalty_points, -15)
    WHERE id = v_entry.technician_id;

    -- Create notification for the user (using correct schema)
    INSERT INTO notifications (
      user_id,
      type,
      title,
      body,
      related_id
    ) VALUES (
      v_entry.technician_id,
      'system',
      'Auto Clock-Out Applied',
      'You were automatically clocked out at ' || 
        TO_CHAR(v_clock_out_time, 'HH24:MI') || 
        ' because you forgot to clock out on ' ||
        TO_CHAR(v_entry.entry_date, 'MM/DD/YYYY') ||
        '. Points penalty: ' ||
        COALESCE(v_settings.forgot_clock_out_penalty_points, -15) || ' points.',
      v_entry.id::text
    );

    -- Track processed entries
    v_entries_count := v_entries_count + 1;
    v_tech_ids := array_append(v_tech_ids, v_entry.technician_id);
    v_entry_ids := array_append(v_entry_ids, v_entry.id);
  END LOOP;

  -- Return summary
  RETURN QUERY SELECT v_entries_count, v_tech_ids, v_entry_ids;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
