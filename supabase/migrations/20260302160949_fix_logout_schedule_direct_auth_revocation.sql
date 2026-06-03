/*
  # Fix Logout Schedule - Direct Auth Token Revocation

  ## Problem
  The previous attempt used `current_setting('app.settings.supabase_url')` for HTTP calls
  but this setting is NULL in this environment, making the HTTP approach unreliable.

  ## Solution
  Rewrite `execute_scheduled_logout()` to directly revoke auth tokens by:
  1. Deleting rows from `auth.refresh_tokens` (invalidates all refresh tokens)
  2. Deleting rows from `auth.sessions` (invalidates all active auth sessions)
  3. Closing `user_sessions` tracking records
  4. Updating `session_logout_schedule` last_run_at / last_run_count

  This is exactly what Supabase's `signOut('global')` does internally and works
  entirely within the database without requiring HTTP calls.

  ## Notes
  - SECURITY DEFINER allows access to the `auth` schema
  - The function checks the schedule config before doing anything
  - Uses timezone-aware time comparison so the configured time is respected
*/

CREATE OR REPLACE FUNCTION execute_scheduled_logout()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_schedule RECORD;
  v_configured_utc timestamptz;
  v_now_minute timestamptz;
  v_sessions_closed integer := 0;
  v_tokens_revoked integer := 0;
BEGIN
  -- Load the schedule configuration
  SELECT * INTO v_schedule
  FROM public.session_logout_schedule
  LIMIT 1;

  -- If no schedule row or not enabled, skip
  IF v_schedule IS NULL OR NOT v_schedule.enabled THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'Schedule disabled or not configured');
  END IF;

  -- Convert the configured logout_time + timezone to a UTC timestamp for today
  v_configured_utc := (
    (current_date::text || ' ' || v_schedule.logout_time::text)::timestamp AT TIME ZONE v_schedule.timezone
  );

  -- Truncate both times to the minute for comparison
  v_now_minute := date_trunc('minute', now() AT TIME ZONE 'UTC');

  -- Only run when the current UTC minute matches the configured logout time
  IF date_trunc('minute', v_configured_utc AT TIME ZONE 'UTC') <> v_now_minute THEN
    RETURN jsonb_build_object(
      'skipped', true,
      'reason', 'Not the scheduled time',
      'configured_utc', v_configured_utc,
      'current_utc', now()
    );
  END IF;

  -- Revoke all active auth refresh tokens (invalidates sessions app-wide)
  DELETE FROM auth.refresh_tokens
  WHERE revoked = false OR revoked IS NULL;
  GET DIAGNOSTICS v_tokens_revoked = ROW_COUNT;

  -- Delete all active auth sessions
  DELETE FROM auth.sessions;

  -- Close all active user_sessions tracking records
  UPDATE public.user_sessions
  SET is_active = false, session_end = now()
  WHERE is_active = true;
  GET DIAGNOSTICS v_sessions_closed = ROW_COUNT;

  -- Record the run in the schedule table
  UPDATE public.session_logout_schedule
  SET
    last_run_at = now(),
    last_run_count = v_sessions_closed,
    updated_at = now()
  WHERE id = v_schedule.id;

  -- Also log to session_cleanup_log
  INSERT INTO public.session_cleanup_log (sessions_closed, success)
  VALUES (v_sessions_closed, true);

  RETURN jsonb_build_object(
    'success', true,
    'sessions_closed', v_sessions_closed,
    'tokens_revoked', v_tokens_revoked,
    'executed_at', now()
  );

EXCEPTION WHEN OTHERS THEN
  -- Log the error
  BEGIN
    INSERT INTO public.session_cleanup_log (sessions_closed, success, error_message)
    VALUES (0, false, SQLERRM);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RAISE WARNING 'execute_scheduled_logout error: %', SQLERRM;
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
