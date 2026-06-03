/*
  # Repair Time Clock Entries with Negative Hours

  1. Data Repair
    - Identifies entries where clock_out is before clock_in
    - Identifies entries with negative total_hours
    - Fixes by adding 1 day to clock_out (assumes overnight shift)
    - Recalculates total_hours correctly
    - Marks entries as admin_adjusted with explanation

  2. Notes
    - This fixes timezone bugs that created invalid timestamps
    - Entries are marked so admins can review if needed
    - After repair, validation constraints can be added

  3. Logging
    - Creates log of repair operations for audit trail
*/

-- First, let's see what we're dealing with
DO $$
DECLARE
  bad_entry_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO bad_entry_count
  FROM daily_clock_entries
  WHERE (clock_out IS NOT NULL AND clock_out < clock_in)
     OR total_hours < 0;
  
  RAISE NOTICE 'Found % entries with negative hours or invalid timestamps', bad_entry_count;
END $$;

-- Fix entries where clock_out is before clock_in
-- Assumption: these are overnight shifts, so clock_out should be next day
UPDATE daily_clock_entries
SET 
  clock_out = clock_out + interval '1 day',
  total_hours = EXTRACT(EPOCH FROM ((clock_out + interval '1 day') - clock_in)) / 3600 - (break_minutes / 60.0),
  notes = COALESCE(notes || E'\n\n', '') || '[SYSTEM REPAIR] Clock out was before clock in. Adjusted to next day (overnight shift assumed).',
  admin_adjusted = true,
  adjustment_reason = COALESCE(adjustment_reason || ' | ', '') || 'System repair: fixed negative hours due to timezone bug'
WHERE clock_out IS NOT NULL 
  AND clock_out < clock_in;

-- Fix any remaining entries with negative total_hours by recalculating
UPDATE daily_clock_entries
SET 
  total_hours = CASE 
    WHEN clock_out IS NOT NULL 
    THEN GREATEST(0, EXTRACT(EPOCH FROM (clock_out - clock_in)) / 3600 - (break_minutes / 60.0))
    ELSE NULL
  END,
  notes = COALESCE(notes || E'\n\n', '') || '[SYSTEM REPAIR] Total hours was negative. Recalculated from timestamps.',
  admin_adjusted = true,
  adjustment_reason = COALESCE(adjustment_reason || ' | ', '') || 'System repair: recalculated negative total_hours'
WHERE total_hours < 0;

-- Log the repair operation
DO $$
DECLARE
  repaired_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO repaired_count
  FROM daily_clock_entries
  WHERE notes LIKE '%[SYSTEM REPAIR]%'
    AND adjustment_reason LIKE '%System repair%';
  
  RAISE NOTICE 'Repaired % time clock entries', repaired_count;
END $$;
