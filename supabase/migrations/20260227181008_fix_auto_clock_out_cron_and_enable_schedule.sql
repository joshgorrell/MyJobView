/*
  # Fix Auto Clock-Out Cron Schedule

  ## Problem
  The cron job was scheduled at 23:30 UTC = 5:30 PM Chicago CST, which is 4.5 hours
  BEFORE the 22:00 Chicago cutoff time. The SQL function logic:
  - If current_time >= cutoff_time → process today's entries
  - If current_time < cutoff_time → process only entries older than yesterday's cutoff

  Since 17:30 < 22:00, cutoff_date was always set to yesterday, meaning employees who
  forget to clock out TODAY are never caught until the FOLLOWING night.

  ## Fix
  Reschedule to 5:00 AM UTC = 11:00 PM Chicago CST (safely past 22:00 cutoff).
  Also enable auto_clock_out_schedule_enabled which was false.
*/

-- Reschedule using cron.unschedule + cron.schedule
SELECT cron.unschedule('auto-clock-out-daily');
SELECT cron.schedule('auto-clock-out-daily', '0 5 * * *', 'SELECT auto_clock_out_forgotten_entries();');

-- Enable the schedule flag so both the cron and edge function work
UPDATE company_settings
SET auto_clock_out_schedule_enabled = true
WHERE auto_clock_out_schedule_enabled = false OR auto_clock_out_schedule_enabled IS NULL;
