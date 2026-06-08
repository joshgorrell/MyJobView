/*
  # Fix execute_scheduled_logout - session_cleanup_log org_id failure

  ## Root Cause
  The function runs as a pg_cron job (no authenticated user), so get_user_org_id()
  returns NULL. The session_cleanup_log table has organization_id NOT NULL with
  default get_user_org_id(), causing the INSERT to fail silently every midnight.
  Because the exception handler's INSERT also fails, errors were completely hidden.

  ## Fix
  Hardcode the organization_id by looking it up from the organizations table.
  Single-tenant app — there is exactly one organization row.
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
  v_org_id uuid;
BEGIN
  -- Resolve organization_id for logging (pg_cron has no authenticated user)
  SELECT id INTO v_org_id FROM public.organizations LIMIT 1;

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

  -- Log to session_cleanup_log with explicit org_id (not get_user_org_id() which is NULL in cron)
  INSERT INTO public.session_cleanup_log (sessions_closed, success, organization_id)
  VALUES (v_sessions_closed, true, v_org_id);

  RETURN jsonb_build_object(
    'success', true,
    'sessions_closed', v_sessions_closed,
    'tokens_revoked', v_tokens_revoked,
    'executed_at', now()
  );

EXCEPTION WHEN OTHERS THEN
  -- Log the error with explicit org_id so this INSERT doesn't fail too
  BEGIN
    INSERT INTO public.session_cleanup_log (sessions_closed, success, error_message, organization_id)
    VALUES (0, false, SQLERRM, v_org_id);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RAISE WARNING 'execute_scheduled_logout error: %', SQLERRM;
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
