/*
  # Enable pg_cron and Schedule Midnight Session Cleanup

  1. Changes
    - Enable pg_cron extension
    - Create cron job to run midnight session cleanup daily at midnight
    - Uses http extension to call the edge function

  2. Schedule
    - Runs every day at midnight UTC (0 0 * * *)
    - Calls the midnight-session-cleanup edge function
    - Automatically cleans up sessions inactive for more than 5 minutes
*/

-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Enable http extension to make HTTP requests
CREATE EXTENSION IF NOT EXISTS http;

-- Schedule the midnight session cleanup job
-- This will run every day at midnight UTC
SELECT cron.schedule(
  'midnight-session-cleanup',           -- Job name
  '0 0 * * *',                          -- Every day at midnight UTC
  $$
  SELECT content::json
  FROM http((
    'POST',
    current_setting('app.settings.api_url') || '/functions/v1/midnight-session-cleanup',
    ARRAY[http_header('Content-Type', 'application/json')],
    'application/json',
    '{}'
  )::http_request);
  $$
);

-- Add a comment
COMMENT ON EXTENSION pg_cron IS 'Job scheduler for PostgreSQL - used for midnight session cleanup and other scheduled tasks';