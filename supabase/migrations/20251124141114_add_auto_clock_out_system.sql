/*
  # Add Automatic Clock-Out System
  
  1. New Functions
    - `auto_clock_out_forgotten_entries()` - Automatically clocks out users who forgot to clock out
    - Called at end of business day (via scheduled job or manual trigger)
  
  2. Features
    - Auto clocks out any entries from previous days that are still "clocked_in"
    - Applies a points penalty for forgetting to clock out
    - Sets clock_out time to the user's standard_end_time on that day
    - Marks the entry as admin_adjusted with reason
    - Creates a notification for the user
    - Creates a reward log entry with penalty
  
  3. Company Settings
    - Add `auto_clock_out_enabled` boolean to company_settings
    - Add `forgot_clock_out_penalty_points` integer to company_settings
    - Add `business_day_end_time` time to company_settings
  
  4. Important Notes
    - This should be run via a scheduled job (pg_cron) or external cron
    - Only affects entries from previous days, not current day
    - Admins can manually adjust if the auto clock-out was incorrect
*/

-- Add auto clock-out settings to company_settings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'auto_clock_out_enabled'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN auto_clock_out_enabled boolean DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'forgot_clock_out_penalty_points'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN forgot_clock_out_penalty_points integer DEFAULT -15;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'business_day_end_time'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN business_day_end_time time DEFAULT '18:00:00';
  END IF;
END $$;

-- Function to automatically clock out forgotten entries
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

    -- Create notification for the user
    INSERT INTO notifications (
      user_id,
      type,
      title,
      body,
      reference_id,
      reference_type
    ) VALUES (
      v_entry.technician_id,
      'system',
      'Auto Clock-Out Applied',
      'You were automatically clocked out at ' || 
        TO_CHAR(v_clock_out_time, 'HH24:MI') || 
        ' because you forgot to clock out yesterday. Points penalty: ' ||
        COALESCE(v_settings.forgot_clock_out_penalty_points, -15) || ' points.',
      v_entry.id::text,
      'daily_clock_entry'
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

-- Grant execute permission to authenticated users (admins can run this manually)
GRANT EXECUTE ON FUNCTION auto_clock_out_forgotten_entries() TO authenticated;

-- Create a view for admins to see entries that will be auto-clocked-out
CREATE OR REPLACE VIEW entries_pending_auto_clock_out AS
SELECT 
  dce.id,
  dce.technician_id,
  p.full_name,
  p.email,
  dce.entry_date,
  dce.clock_in,
  COALESCE(p.standard_end_time, cs.business_day_end_time) as will_clock_out_at,
  EXTRACT(EPOCH FROM (now() - dce.clock_in)) / 3600 as hours_since_clock_in
FROM daily_clock_entries dce
JOIN profiles p ON p.id = dce.technician_id
CROSS JOIN company_settings cs
WHERE dce.status = 'clocked_in'
AND dce.entry_date < CURRENT_DATE
ORDER BY dce.entry_date DESC, dce.clock_in DESC;

-- Grant select on the view to authenticated users with admin role
GRANT SELECT ON entries_pending_auto_clock_out TO authenticated;

COMMENT ON FUNCTION auto_clock_out_forgotten_entries() IS 
'Automatically clocks out users who forgot to clock out from previous days. 
Should be run daily via pg_cron or external scheduler.
Returns count of entries processed and affected user/entry IDs.';

COMMENT ON VIEW entries_pending_auto_clock_out IS
'Shows all clock entries from previous days that are still clocked_in and will be auto-clocked-out.
Useful for admins to preview what will be affected before running auto clock-out.';