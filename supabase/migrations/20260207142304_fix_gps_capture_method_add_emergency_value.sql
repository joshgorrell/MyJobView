/*
  # Fix GPS Capture Method Constraints - Add 'emergency' Value

  1. Changes to `daily_clock_entries`
    - Update CHECK constraint on `clock_in_gps_capture_method` to include 'emergency'
    - Update CHECK constraint on `clock_out_gps_capture_method` to include 'emergency'

  2. Changes to `time_entries`
    - Update CHECK constraint on `clock_in_gps_capture_method` to include 'emergency'
    - Update CHECK constraint on `clock_out_gps_capture_method` to include 'emergency'

  3. Notes
    - The GPS tracking code has an 'emergency' fallback method that tries to get any location
    - Without 'emergency' in the CHECK constraint, GPS data from this method silently fails to save
    - This was causing GPS data loss when the emergency fallback was triggered
*/

-- Fix daily_clock_entries constraints
ALTER TABLE daily_clock_entries
DROP CONSTRAINT IF EXISTS daily_clock_entries_clock_in_gps_capture_method_check;

ALTER TABLE daily_clock_entries
ADD CONSTRAINT daily_clock_entries_clock_in_gps_capture_method_check
CHECK (clock_in_gps_capture_method IN ('high_accuracy', 'network', 'cached', 'emergency', 'failed', 'none'));

ALTER TABLE daily_clock_entries
DROP CONSTRAINT IF EXISTS daily_clock_entries_clock_out_gps_capture_method_check;

ALTER TABLE daily_clock_entries
ADD CONSTRAINT daily_clock_entries_clock_out_gps_capture_method_check
CHECK (clock_out_gps_capture_method IN ('high_accuracy', 'network', 'cached', 'emergency', 'failed', 'none'));

-- Fix time_entries constraints
ALTER TABLE time_entries
DROP CONSTRAINT IF EXISTS time_entries_clock_in_gps_capture_method_check;

ALTER TABLE time_entries
ADD CONSTRAINT time_entries_clock_in_gps_capture_method_check
CHECK (clock_in_gps_capture_method IN ('high_accuracy', 'network', 'cached', 'emergency', 'failed', 'none'));

ALTER TABLE time_entries
DROP CONSTRAINT IF EXISTS time_entries_clock_out_gps_capture_method_check;

ALTER TABLE time_entries
ADD CONSTRAINT time_entries_clock_out_gps_capture_method_check
CHECK (clock_out_gps_capture_method IN ('high_accuracy', 'network', 'cached', 'emergency', 'failed', 'none'));