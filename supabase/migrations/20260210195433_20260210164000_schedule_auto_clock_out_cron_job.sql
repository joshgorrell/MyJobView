/*
  # Schedule Auto Clock-Out Cron Job
  
  1. Issue
    - Auto clock-out system exists but no cron job is scheduled
    - The auto_clock_out_schedule_enabled flag exists but is disabled
    - Technicians are not being auto-clocked out at end of day
  
  2. Changes
    - Enable pg_cron extension if not already enabled
    - Schedule a cron job to run auto-clock-out function daily
    - Runs at 11:30 PM daily (30 minutes after default cutoff time of 10 PM)
    - Calls the Edge Function auto-clock-out-scheduler
  
  3. Notes
    - The Edge Function checks both auto_clock_out_enabled and auto_clock_out_schedule_enabled flags
    - Admins can disable by setting auto_clock_out_schedule_enabled to false
    - The function logs all executions to auto_clock_out_execution_log table
*/

-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule the auto clock-out job to run daily at 11:30 PM
-- This is 30 minutes after the default cutoff time of 10:00 PM
SELECT cron.schedule(
  'auto-clock-out-daily',
  '30 23 * * *',
  $$
  SELECT
    net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/auto-clock-out-scheduler',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key')
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);

COMMENT ON EXTENSION pg_cron IS 'pg_cron extension for scheduled jobs';
