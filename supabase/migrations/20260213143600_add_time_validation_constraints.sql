/*
  # Add Time Clock Validation Constraints

  1. Constraints Added
    - Ensure clock_out is always after clock_in (prevents negative hours)
    - Ensure total_hours is never negative
    - Prevent data corruption from timezone mishandling

  2. Security
    - These constraints prevent invalid data from being inserted
    - Will fail any operations that try to create negative hours

  3. Notes
    - CRITICAL: This prevents the timezone bug from creating invalid data
    - Bad data has been repaired in previous migration
*/

-- Add constraint to ensure clock_out is after clock_in
ALTER TABLE daily_clock_entries
ADD CONSTRAINT check_clock_out_after_clock_in
CHECK (clock_out IS NULL OR clock_out > clock_in);

-- Add constraint to ensure total_hours is positive
ALTER TABLE daily_clock_entries
ADD CONSTRAINT check_total_hours_positive
CHECK (total_hours IS NULL OR total_hours >= 0);

-- Create index to speed up auto-clock-out queries
CREATE INDEX IF NOT EXISTS idx_daily_clock_entries_status_clock_in 
ON daily_clock_entries(status, clock_in) 
WHERE status = 'clocked_in';
