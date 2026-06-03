/*
  # Add payroll_hours_only flag to daily_clock_entries

  ## Summary
  Adds a boolean flag `payroll_hours_only` to `daily_clock_entries` that marks records
  imported from payroll/spreadsheet data where only total hours are known (no actual
  clock-in/clock-out timestamps).

  ## Changes
  - `daily_clock_entries`: new column `payroll_hours_only boolean DEFAULT false`
    - When true, `clock_in` holds a noon-of-day sentinel and `clock_out` is null
    - `total_hours` is the authoritative value for efficiency/stats calculations
    - These entries are visually distinguished in the UI and excluded from time-clock displays

  ## Why
  Allows importing payroll spreadsheets (employee + date + hours) without fabricating
  clock-in/clock-out timestamps. TechStats and Job Time History use `total_hours` directly,
  so efficiency calculations work correctly without needing synthetic timestamps.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'daily_clock_entries'
      AND column_name = 'payroll_hours_only'
  ) THEN
    ALTER TABLE daily_clock_entries
      ADD COLUMN payroll_hours_only boolean DEFAULT false;
  END IF;
END $$;
