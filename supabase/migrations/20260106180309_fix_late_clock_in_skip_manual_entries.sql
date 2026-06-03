/*
  # Fix Late Clock-In Alert for Manual Admin Entries

  1. Changes
    - Update `check_late_clock_in()` function to skip creating alerts when:
      - The entry is manually created/adjusted by an admin (`admin_adjusted = true`)
      - This prevents unnecessary alerts when admins create backdated or corrected entries
    
  2. Reason
    - Manual admin entries are already reviewed and approved by admins
    - Creating late clock-in alerts for these entries is redundant and confusing
    - Admins should only see alerts for actual late clock-ins, not their own manual corrections
*/

-- Update function to skip manual admin entries
CREATE OR REPLACE FUNCTION check_late_clock_in()
RETURNS trigger AS $$
DECLARE
  tech_start_time time;
  minutes_diff integer;
  alert_exists boolean;
BEGIN
  -- Skip if this is a manual admin entry
  IF NEW.admin_adjusted = true THEN
    RETURN NEW;
  END IF;

  -- Get technician scheduled start time
  SELECT standard_start_time INTO tech_start_time
  FROM profiles
  WHERE id = NEW.technician_id;
  
  -- If no standard start time skip
  IF tech_start_time IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Calculate minutes late
  minutes_diff := EXTRACT(EPOCH FROM (NEW.clock_in::time - tech_start_time)) / 60;
  
  -- If more than 15 minutes late create alert
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
        NEW.clock_in::time,
        minutes_diff::integer
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;