/*
  # Remove unique constraint on daily clock entries
  
  This migration removes the unique constraint on (technician_id, entry_date) 
  to allow multiple clock in/out entries per day for the same technician.
  
  Changes:
  - Drop unique constraint on daily_clock_entries(technician_id, entry_date)
  
  This enables:
  - Multiple clock-in and clock-out sessions per day
  - Flexible work schedules with breaks between shifts
*/

-- Drop the unique constraint
ALTER TABLE daily_clock_entries 
DROP CONSTRAINT IF EXISTS daily_clock_entries_technician_id_entry_date_key;