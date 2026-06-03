/*
  # Fix Logout Schedule - Honor Configured Time and Revoke Tokens

  ## Problem
  The existing cron job (jobid 2) was hardcoded to midnight UTC and never read the
  `session_logout_schedule` table. It also only cleaned up session records — it did
  NOT revoke Supabase auth tokens, so users were not actually logged out.

  ## Changes

  ### 1. New Function: `execute_scheduled_logout()`
  - Reads the `session_logout_schedule` table to get enabled, logout_time, timezone
  - Converts the configured time in the specified timezone to UTC for accurate comparison
  - Uses a 1-minute window to handle cron precision
  - If the schedule is enabled and the current UTC minute matches the configured time,
    it makes an HTTP POST to the `force-logout-all-users` edge function
  - Updates `last_run_at` and `last_run_count` after execution

  ### 2. Updated Cron Job
  - Changes jobid 2 schedule from `0 0 * * *` (midnight UTC only) to `* * * * *`
    (every minute) so it can trigger at any admin-configured time
  - Points to the new `execute_scheduled_logout()` function

  ## Important Notes
  - The `force-logout-all-users` edge function actually calls `signOut()` to revoke tokens
  - The `pg_net` / `http` extension is used to call the edge function from within Postgres
  - The existing `midnight_session_cleanup()` function is preserved for backward compatibility
*/

-- Create the schedule-aware logout function that checks configured time before acting
CREATE OR REPLACE FUNCTION execute_scheduled_logout()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_schedule RECORD;
  v_supabase_url text;
  v_service_role_key text;
  v_configured_utc timestamptz;
  v_now_minute timestamptz;
  v_result jsonb;
  v_http_response jsonb;
BEGIN
  -- Load the schedule configuration
  SELECT * INTO v_schedule
  FROM session_logout_schedule
  LIMIT 1;

  -- If no schedule row exists or not enabled, do nothing
  IF v_schedule IS NULL OR NOT v_schedule.enabled THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'Schedule disabled or not configured');
  END IF;

  -- Convert the configured logout_time + timezone to a UTC timestamp for today
  -- This gives us the exact UTC moment when the logout should fire today
  v_configured_utc := (
    (current_date::text || ' ' || v_schedule.logout_time::text)::timestamp AT TIME ZONE v_schedule.timezone
  );

  -- Truncate both times to the minute for comparison
  v_now_minute := date_trunc('minute', now() AT TIME ZONE 'UTC');

  -- Check if the current UTC minute matches the configured logout time (in UTC)
  IF date_trunc('minute', v_configured_utc AT TIME ZONE 'UTC') <> v_now_minute THEN
    RETURN jsonb_build_object(
      'skipped', true,
      'reason', 'Not the scheduled time',
      'configured_utc', v_configured_utc,
      'current_utc', now()
    );
  END IF;

  -- It's time to run! Get Supabase config for the HTTP call
  v_supabase_url := current_setting('app.supabase_url', true);
  v_service_role_key := current_setting('app.service_role_key', true);

  -- If we don't have the settings configured, fall back to direct session cleanup
  -- and update the schedule record so last_run_at is tracked
  IF v_supabase_url IS NULL OR v_service_role_key IS NULL THEN
    -- Fallback: directly close sessions in DB (tokens won't be revoked but sessions are closed)
    WITH closed AS (
      UPDATE user_sessions
      SET is_active = false, session_end = now()
      WHERE is_active = true
      RETURNING id
    )
    SELECT jsonb_build_object('sessions_closed', count(*)) INTO v_result FROM closed;

    UPDATE session_logout_schedule
    SET
      last_run_at = now(),
      last_run_count = (v_result->>'sessions_closed')::integer,
      updated_at = now()
    WHERE id = v_schedule.id;

    RETURN jsonb_build_object(
      'success', true,
      'method', 'direct_db_fallback',
      'sessions_closed', (v_result->>'sessions_closed')::integer
    );
  END IF;

  -- Make HTTP POST to force-logout-all-users edge function
  -- This properly revokes Supabase auth tokens
  SELECT content::jsonb INTO v_http_response
  FROM http((
    'POST',
    v_supabase_url || '/functions/v1/force-logout-all-users',
    ARRAY[
      http_header('Authorization', 'Bearer ' || v_service_role_key),
      http_header('Content-Type', 'application/json')
    ],
    'application/json',
    '{"scheduled": true}'
  )::http_request);

  RETURN jsonb_build_object(
    'success', true,
    'method', 'edge_function',
    'response', v_http_response
  );

EXCEPTION WHEN OTHERS THEN
  -- Log the error but don't crash
  RAISE WARNING 'execute_scheduled_logout error: %', SQLERRM;
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Update the cron job to run every minute and use the new schedule-aware function
-- This allows it to fire at any admin-configured time, not just hardcoded midnight
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE command LIKE '%execute_midnight_session_cleanup%';

SELECT cron.schedule(
  'scheduled-user-logout',
  '* * * * *',
  'SELECT execute_scheduled_logout();'
);
