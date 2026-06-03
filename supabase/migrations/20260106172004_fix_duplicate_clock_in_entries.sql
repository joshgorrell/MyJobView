/*
  # Fix Duplicate Clock-In Entries
  
  1. Cleanup
    - Close out older duplicate clock-in entries for any technician who has multiple active entries
    - Keep the most recent clock-in as the active one
  
  2. Constraints
    - Add a partial unique index to prevent multiple active clock-ins per technician per day
    - This allows multiple completed entries but only one active entry at a time
  
  3. Security
    - No RLS changes needed
*/

-- First, identify and auto-clock-out older duplicate active entries
-- Keep the most recent clock-in active, clock out the older ones
WITH duplicate_entries AS (
  SELECT 
    id,
    technician_id,
    entry_date,
    clock_in,
    ROW_NUMBER() OVER (
      PARTITION BY technician_id, entry_date 
      ORDER BY clock_in DESC
    ) as rn
  FROM daily_clock_entries
  WHERE clock_out IS NULL
)
UPDATE daily_clock_entries
SET 
  clock_out = NOW(),
  status = 'clocked_out',
  notes = COALESCE(notes || E'\n\n', '') || 'Auto-closed due to duplicate clock-in entry. System fixed on ' || NOW()::text
FROM duplicate_entries
WHERE daily_clock_entries.id = duplicate_entries.id
  AND duplicate_entries.rn > 1;

-- Create a partial unique index to prevent future duplicates
-- This allows multiple clock entries per day, but only ONE can have clock_out = NULL
-- (i.e., only one active clock-in at a time)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_clock_in_per_day
  ON daily_clock_entries(technician_id, entry_date)
  WHERE clock_out IS NULL;

-- Add a helpful comment
COMMENT ON INDEX idx_unique_active_clock_in_per_day IS 
  'Ensures only one active clock-in entry (clock_out IS NULL) per technician per day. Allows multiple completed entries.';