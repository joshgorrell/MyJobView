/*
  # Add Late Clock-In Detection Trigger

  1. Changes
    - Create function to automatically detect and alert on really late clock-ins
    - Create trigger to run on each clock-in
    
  2. Security
    - Function runs with SECURITY DEFINER to create alerts
*/

-- Function to create alert for really late clock-in
CREATE OR REPLACE FUNCTION check_late_clock_in()
RETURNS trigger AS $$
DECLARE
  tech_start_time time;
  minutes_diff integer;
  alert_exists boolean;
BEGIN
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

-- Create trigger for late clock-ins
DROP TRIGGER IF EXISTS trigger_check_late_clock_in ON daily_clock_entries;
CREATE TRIGGER trigger_check_late_clock_in
  AFTER INSERT ON daily_clock_entries
  FOR EACH ROW
  EXECUTE FUNCTION check_late_clock_in();
