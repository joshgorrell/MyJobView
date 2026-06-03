/*
  # Fix Late Clock-In Trigger — Use Local Timezone for Time Comparison

  ## Problem
  The `check_late_clock_in()` trigger was casting `NEW.clock_in::time` directly to extract
  the clock-in time. Since `clock_in` is stored as a UTC timestamptz, this extracted the
  UTC time (e.g. 14:06 UTC) instead of the local time (e.g. 08:06 CST), causing alerts
  to show the wrong clock-in time and incorrect "minutes late" calculations.

  ## Fix
  - Look up the organization's configured timezone
  - Convert the UTC `clock_in` timestamp to that local timezone before extracting the time
  - Store the correct local time in `actual_clock_in_time`
  - Calculate `minutes_late` using the local time, not UTC time
*/

CREATE OR REPLACE FUNCTION check_late_clock_in()
RETURNS trigger AS $$
DECLARE
  tech_start_time time;
  minutes_diff integer;
  alert_exists boolean;
  org_timezone text;
  local_clock_in_time time;
BEGIN
  -- Get technician scheduled start time
  SELECT standard_start_time INTO tech_start_time
  FROM profiles
  WHERE id = NEW.technician_id;

  -- If no standard start time, skip
  IF tech_start_time IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get organization timezone
  SELECT COALESCE(timezone, 'America/Chicago') INTO org_timezone
  FROM organizations
  LIMIT 1;

  -- Convert UTC clock_in to the org's local time, then extract the time portion
  local_clock_in_time := (NEW.clock_in AT TIME ZONE org_timezone)::time;

  -- Calculate minutes late using local time
  minutes_diff := EXTRACT(EPOCH FROM (local_clock_in_time - tech_start_time)) / 60;

  -- If more than 15 minutes late, create alert
  IF minutes_diff > 15 THEN
    -- Check if alert already exists for this date
    SELECT EXISTS(
      SELECT 1 FROM time_clock_alerts
      WHERE technician_id = NEW.technician_id
      AND alert_date = NEW.entry_date
      AND alert_type = 'really_late'
    ) INTO alert_exists;

    -- Only create if it does not exist
    IF NOT alert_exists THEN
      INSERT INTO time_clock_alerts (
        technician_id,
        alert_date,
        alert_type,
        scheduled_start_time,
        actual_clock_in_time,
        minutes_late
      ) VALUES (
        NEW.technician_id,
        NEW.entry_date,
        'really_late',
        tech_start_time,
        local_clock_in_time,
        minutes_diff::integer
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
