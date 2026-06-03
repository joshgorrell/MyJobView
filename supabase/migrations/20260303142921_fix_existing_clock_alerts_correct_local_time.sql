/*
  # Fix Existing Clock Alerts — Correct UTC→Local Time Conversion

  ## Problem
  All existing `time_clock_alerts` records have `actual_clock_in_time` and `minutes_late`
  calculated from the raw UTC time of the clock_in timestamp instead of the local
  org timezone (America/Chicago). This caused times to appear 6 hours late.

  ## Fix
  For each unresolved alert that has a matching `daily_clock_entries` record,
  recalculate `actual_clock_in_time` and `minutes_late` using the correct local time.
*/

DO $$
DECLARE
  org_tz text;
BEGIN
  SELECT COALESCE(timezone, 'America/Chicago') INTO org_tz
  FROM organizations
  LIMIT 1;

  UPDATE time_clock_alerts a
  SET
    actual_clock_in_time = (e.clock_in AT TIME ZONE org_tz)::time,
    minutes_late = EXTRACT(EPOCH FROM (
      (e.clock_in AT TIME ZONE org_tz)::time - a.scheduled_start_time
    )) / 60
  FROM (
    SELECT DISTINCT ON (technician_id, entry_date)
      technician_id,
      entry_date,
      clock_in
    FROM daily_clock_entries
    ORDER BY technician_id, entry_date, clock_in ASC
  ) e
  WHERE a.technician_id = e.technician_id
    AND a.alert_date = e.entry_date
    AND a.alert_type = 'really_late';
END $$;
