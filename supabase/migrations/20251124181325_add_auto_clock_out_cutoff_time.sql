/*
  # Add Auto Clock-Out Cutoff Time Setting

  1. Changes
    - Add `auto_clock_out_cutoff_time` to company_settings
      - This is the time after which the system should look for users who haven't clocked out
      - Example: If set to 22:00 (10pm), the system checks if users forgot to clock out after 10pm
    - Keep `business_day_end_time` as the time to actually clock them out
      - Example: If set to 17:00 (5pm), users who forgot will be clocked out at 5pm
  
  2. Logic Flow
    - At cutoff time (e.g., 10pm), check for entries still clocked in
    - Clock them out at business_day_end_time (e.g., 5pm) for that entry date
    - Admin is alerted via the pending_auto_clock_out view
    - Admin can manually run the auto_clock_out function to process them

  3. Default Values
    - `auto_clock_out_cutoff_time`: 22:00:00 (10pm)
    - `business_day_end_time`: 17:00:00 (5pm) - already exists
*/

-- Add auto_clock_out_cutoff_time to company_settings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'auto_clock_out_cutoff_time'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN auto_clock_out_cutoff_time time DEFAULT '22:00:00';
    COMMENT ON COLUMN company_settings.auto_clock_out_cutoff_time IS 
      'Time after which to check for users who forgot to clock out (e.g., 22:00 means check at 10pm)';
  END IF;
END $$;

-- Drop and recreate the view to change column type
DROP VIEW IF EXISTS entries_pending_auto_clock_out;

CREATE VIEW entries_pending_auto_clock_out AS
SELECT 
  dce.id,
  dce.technician_id,
  p.full_name,
  p.email,
  dce.entry_date,
  dce.clock_in,
  COALESCE(
    (dce.entry_date || ' ' || p.standard_end_time::text),
    (dce.entry_date || ' ' || cs.business_day_end_time::text)
  )::timestamptz as will_clock_out_at,
  EXTRACT(EPOCH FROM (NOW() - dce.clock_in)) / 3600 as hours_since_clock_in
FROM daily_clock_entries dce
JOIN profiles p ON p.id = dce.technician_id
CROSS JOIN company_settings cs
WHERE dce.status = 'clocked_in'
  AND dce.entry_date < CURRENT_DATE
  AND cs.auto_clock_out_enabled = true
ORDER BY dce.entry_date, dce.clock_in;

GRANT SELECT ON entries_pending_auto_clock_out TO authenticated;

COMMENT ON VIEW entries_pending_auto_clock_out IS 
  'Shows users who are still clocked in from previous days and are pending auto clock-out';
