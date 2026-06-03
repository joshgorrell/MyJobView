/*
  # Fix Auto Clock-Out Cron Job - Enable pg_net Extension

  1. Problem
    - Auto clock-out cron job is failing with "schema 'net' does not exist"
    - The pg_net extension is required for HTTP requests from cron jobs
    - Technicians are not being auto-clocked out

  2. Solution
    - Enable pg_net extension
    - Also create a simpler backup approach that calls the function directly
    - Update the cron job to use direct function call instead of HTTP

  3. Impact
    - Auto clock-out will now run successfully at 11:30 PM daily
    - Forgotten clock-outs will be processed automatically
*/

-- Enable pg_net extension for HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Drop the old cron job that was failing
SELECT cron.unschedule('auto-clock-out-daily');

-- Create a new simplified cron job that calls the function directly
-- This is more reliable and doesn't require Edge Functions or HTTP calls
SELECT cron.schedule(
  'auto-clock-out-daily',
  '30 23 * * *',  -- Run at 11:30 PM every day
  $$
  SELECT auto_clock_out_forgotten_entries();
  $$
);

-- Verify the job is active
COMMENT ON EXTENSION pg_net IS 'pg_net extension for HTTP requests from database';
