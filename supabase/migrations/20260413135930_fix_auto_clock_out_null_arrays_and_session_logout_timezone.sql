/*
  # Fix Auto Clock-Out and Session Logout Bugs

  ## Problems Fixed

  ### 1. auto_clock_out_forgotten_entries() - NULL array crash (nightly failure)
  When no entries need to be processed, the CTE `SELECT array_agg(...) INTO v_entry_ids, v_tech_ids,
  v_tech_names` returns NULL for all three variables because array_agg() on an empty set returns NULL.
  These NULL values are then passed directly to the INSERT into auto_clock_out_execution_log, which
  has NOT NULL constraints with default '{}' on those columns. The explicit NULL overrides the column
  default, causing a constraint violation every night with 0 forgottten clock-outs.

  Fix: wrap v_entry_ids, v_tech_ids, and v_tech_names with COALESCE(..., '{}') in the INSERT.

  ### 2. execute_scheduled_logout() - Midnight session logout never fires
  The function builds the target UTC timestamp using `current_date` (which is the Postgres server
  date in UTC). At midnight Chicago time (06:00 UTC), current_date is already the NEXT day in UTC,
  so the comparison never matches.

  Fix: use `(now() AT TIME ZONE v_schedule.timezone)::date` to get today's date in the local
  timezone when constructing the comparison timestamp.

  ### 3. auto_clock_out_forgotten_entries() - Also auto-close open job time_entries
  The function only handled daily_clock_entries (home/office time clock). Job-level time_entries
  that are left open (status = 'clocked_in' with no clock_out) are not auto-closed. This adds
  that coverage by closing any open time_entries past the cutoff time.

  ## Security
  No RLS changes. Both functions are SECURITY DEFINER and run as superuser via pg_cron.
*/

-- ============================================================
-- FIX 1: Recreate auto_clock_out_forgotten_entries with COALESCE
--         on array variables AND time_entries cleanup
-- ============================================================
CREATE OR REPLACE FUNCTION auto_clock_out_forgotten_entries()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings record;
  v_cutoff_time time;
  v_default_clock_out_time time;
  v_cutoff_timestamp timestamptz;
  v_penalty_points integer;
  v_affected_count integer := 0;
  v_job_entries_count integer := 0;
  v_execution_start timestamptz := clock_timestamp();
  v_execution_log_id uuid;
  v_entry_ids uuid[] := '{}';
  v_tech_ids uuid[] := '{}';
  v_tech_names text[] := '{}';
  v_total_points integer := 0;
  v_admin_ids uuid[] := '{}';
  v_notification_ids uuid[] := '{}';
  v_notification_id uuid;
  v_admin_id uuid;
  v_execution_duration integer;
  v_timezone text;
  v_org_id uuid;
  v_cutoff_date date;
BEGIN
  -- Get company settings including timezone
  SELECT
    organization_id,
    auto_clock_out_enabled,
    auto_clock_out_cutoff_time,
    auto_clock_out_time,
    forgot_clock_out_penalty_points,
    home_clock_notification_roles,
    COALESCE(timezone, 'America/Chicago') as tz
  INTO v_settings
  FROM company_settings
  LIMIT 1;

  IF v_settings IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'No company settings found',
      'entries_processed', 0
    );
  END IF;

  -- Get org_id: prefer company_settings, fall back to organizations table
  v_org_id := COALESCE(
    v_settings.organization_id,
    (SELECT id FROM organizations LIMIT 1)
  );
  v_timezone := v_settings.tz;

  IF NOT v_settings.auto_clock_out_enabled THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Auto clock-out is not enabled',
      'entries_processed', 0
    );
  END IF;

  v_cutoff_time := COALESCE(v_settings.auto_clock_out_cutoff_time, '22:00:00'::time);
  v_default_clock_out_time := COALESCE(v_settings.auto_clock_out_time, '16:00:00'::time);
  v_penalty_points := COALESCE(v_settings.forgot_clock_out_penalty_points, -15);

  -- Determine the cutoff date using the org's local timezone
  IF (now() AT TIME ZONE v_timezone)::time >= v_cutoff_time THEN
    v_cutoff_date := (now() AT TIME ZONE v_timezone)::date;
  ELSE
    v_cutoff_date := (now() AT TIME ZONE v_timezone)::date - interval '1 day';
  END IF;

  -- Construct the cutoff timestamp in the org's timezone
  v_cutoff_timestamp := (to_char(v_cutoff_date, 'YYYY-MM-DD') || ' ' || v_cutoff_time::text)::timestamp AT TIME ZONE v_timezone;

  -- -------------------------------------------------------
  -- STEP A: Process daily_clock_entries (home/office clock)
  -- -------------------------------------------------------
  WITH entries_to_process AS (
    SELECT
      dce.id,
      dce.technician_id,
      dce.clock_in,
      dce.entry_date,
      p.full_name,
      p.requires_daily_clock,
      p.standard_end_time,
      CASE
        WHEN p.standard_end_time IS NOT NULL THEN
          CASE
            WHEN (dce.entry_date || ' ' || p.standard_end_time::text)::timestamp AT TIME ZONE v_timezone > dce.clock_in
            THEN (dce.entry_date || ' ' || p.standard_end_time::text)::timestamp AT TIME ZONE v_timezone
            ELSE (dce.entry_date + interval '1 day' || ' ' || p.standard_end_time::text)::timestamp AT TIME ZONE v_timezone
          END
        ELSE
          CASE
            WHEN (dce.entry_date || ' ' || v_default_clock_out_time::text)::timestamp AT TIME ZONE v_timezone > dce.clock_in
            THEN (dce.entry_date || ' ' || v_default_clock_out_time::text)::timestamp AT TIME ZONE v_timezone
            ELSE (dce.entry_date + interval '1 day' || ' ' || v_default_clock_out_time::text)::timestamp AT TIME ZONE v_timezone
          END
      END as calculated_clock_out
    FROM daily_clock_entries dce
    JOIN profiles p ON p.id = dce.technician_id
    WHERE dce.status = 'clocked_in'
      AND dce.clock_in < v_cutoff_timestamp
      AND p.requires_daily_clock = true
      AND dce.auto_clocked_out = false
  ),
  updated_entries AS (
    UPDATE daily_clock_entries dce
    SET
      clock_out = etp.calculated_clock_out,
      status = 'clocked_out',
      total_hours = GREATEST(
        0,
        EXTRACT(EPOCH FROM (etp.calculated_clock_out - dce.clock_in)) / 3600
      ),
      deduct_points = true,
      points_deducted = v_penalty_points,
      auto_clocked_out = true,
      auto_clocked_out_at = now(),
      auto_clock_out_approved = false,
      notes = COALESCE(notes || E'\n', '') ||
        'Auto-clocked out at ' ||
        to_char(etp.calculated_clock_out AT TIME ZONE v_timezone, 'YYYY-MM-DD HH12:MI:SS AM TZ') ||
        ' (cutoff was ' || to_char(v_cutoff_timestamp AT TIME ZONE v_timezone, 'HH12:MI:SS AM') ||
        '). Penalty: ' || v_penalty_points || ' points.'
    FROM entries_to_process etp
    WHERE dce.id = etp.id
      AND etp.calculated_clock_out > dce.clock_in
    RETURNING dce.id, dce.technician_id, dce.points_deducted, etp.full_name
  )
  SELECT
    COALESCE(array_agg(id), '{}'),
    COALESCE(array_agg(DISTINCT technician_id), '{}'),
    COALESCE(array_agg(DISTINCT full_name), '{}'),
    COALESCE(SUM(ABS(points_deducted))::integer, 0)
  INTO
    v_entry_ids,
    v_tech_ids,
    v_tech_names,
    v_total_points
  FROM updated_entries;

  v_affected_count := COALESCE(array_length(v_entry_ids, 1), 0);

  -- -------------------------------------------------------
  -- STEP B: Process open job time_entries (work order clock)
  -- -------------------------------------------------------
  WITH job_entries_to_close AS (
    SELECT
      te.id,
      te.technician_id,
      te.clock_in,
      te.entry_date,
      CASE
        WHEN (te.entry_date::text || ' ' || v_default_clock_out_time::text)::timestamp AT TIME ZONE v_timezone > te.clock_in
        THEN (te.entry_date::text || ' ' || v_default_clock_out_time::text)::timestamp AT TIME ZONE v_timezone
        ELSE (te.entry_date + interval '1 day' || ' ' || v_default_clock_out_time::text)::timestamp AT TIME ZONE v_timezone
      END as calculated_clock_out
    FROM time_entries te
    WHERE te.status = 'clocked_in'
      AND te.clock_in < v_cutoff_timestamp
      AND te.clock_out IS NULL
  ),
  updated_job_entries AS (
    UPDATE time_entries te
    SET
      clock_out = jec.calculated_clock_out,
      status = 'draft',
      total_hours = GREATEST(
        0,
        EXTRACT(EPOCH FROM (jec.calculated_clock_out - te.clock_in)) / 3600
      ),
      notes = COALESCE(notes || E'\n', '') ||
        'Auto-clocked out at ' ||
        to_char(jec.calculated_clock_out AT TIME ZONE v_timezone, 'YYYY-MM-DD HH12:MI:SS AM TZ') ||
        ' (cutoff was ' || to_char(v_cutoff_timestamp AT TIME ZONE v_timezone, 'HH12:MI:SS AM') || ').'
    FROM job_entries_to_close jec
    WHERE te.id = jec.id
      AND jec.calculated_clock_out > te.clock_in
    RETURNING te.id
  )
  SELECT COUNT(*)::integer INTO v_job_entries_count FROM updated_job_entries;

  -- Award penalty points and notify admins (only for daily clock entries)
  IF v_affected_count > 0 THEN
    FOR i IN 1..array_length(v_tech_ids, 1) LOOP
      PERFORM award_points(
        v_tech_ids[i],
        v_penalty_points,
        'Automatic clock-out penalty for forgotten clock-out on ' || to_char((now() AT TIME ZONE v_timezone)::date, 'YYYY-MM-DD')
      );
    END LOOP;

    -- Notify configured roles (or fall back to admin/owner)
    IF v_settings.home_clock_notification_roles IS NOT NULL AND array_length(v_settings.home_clock_notification_roles, 1) > 0 THEN
      SELECT COALESCE(array_agg(DISTINCT id), '{}')
      INTO v_admin_ids
      FROM profiles
      WHERE role = ANY(v_settings.home_clock_notification_roles);
    ELSE
      SELECT COALESCE(array_agg(DISTINCT id), '{}')
      INTO v_admin_ids
      FROM profiles
      WHERE role IN ('admin', 'owner');
    END IF;

    IF v_admin_ids IS NOT NULL AND array_length(v_admin_ids, 1) > 0 THEN
      FOREACH v_admin_id IN ARRAY v_admin_ids LOOP
        INSERT INTO notifications (
          user_id,
          organization_id,
          type,
          title,
          body,
          related_id
        ) VALUES (
          v_admin_id,
          v_org_id,
          'auto_clock_out',
          'Auto Clock-Out: Needs Approval',
          v_affected_count || ' technician(s) were automatically clocked out and need approval before payroll. Click to review.',
          NULL
        )
        RETURNING id INTO v_notification_id;

        v_notification_ids := array_append(v_notification_ids, v_notification_id);
      END LOOP;
    END IF;
  END IF;

  -- Log execution
  v_execution_duration := EXTRACT(EPOCH FROM (clock_timestamp() - v_execution_start)) * 1000;

  INSERT INTO auto_clock_out_execution_log (
    organization_id,
    executed_at,
    entries_processed,
    entry_ids,
    technician_ids,
    technician_names,
    total_points_deducted,
    admin_notified,
    admin_notification_ids,
    success,
    execution_duration_ms
  ) VALUES (
    v_org_id,
    v_execution_start,
    v_affected_count,
    COALESCE(v_entry_ids, '{}'),       -- FIX: prevent NULL violating NOT NULL constraint
    COALESCE(v_tech_ids, '{}'),        -- FIX: prevent NULL violating NOT NULL constraint
    COALESCE(v_tech_names, '{}'),      -- FIX: prevent NULL violating NOT NULL constraint
    COALESCE(v_total_points, 0),
    COALESCE(array_length(v_admin_ids, 1), 0) > 0,
    COALESCE(v_notification_ids, '{}'),
    true,
    v_execution_duration
  )
  RETURNING id INTO v_execution_log_id;

  UPDATE company_settings
  SET last_auto_clock_out_run = v_execution_start;

  RETURN jsonb_build_object(
    'success', true,
    'execution_log_id', v_execution_log_id,
    'entries_processed', v_affected_count,
    'job_entries_closed', v_job_entries_count,
    'technician_ids', v_tech_ids,
    'technician_names', v_tech_names,
    'total_points_deducted', v_total_points,
    'admin_notified', COALESCE(array_length(v_admin_ids, 1), 0) > 0,
    'notification_count', COALESCE(array_length(v_notification_ids, 1), 0),
    'executed_at', v_execution_start,
    'execution_duration_ms', v_execution_duration,
    'cutoff_time', v_cutoff_time::text,
    'default_clock_out_time', v_default_clock_out_time::text,
    'timezone', v_timezone
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Safe exception logging
    BEGIN
      INSERT INTO auto_clock_out_execution_log (
        organization_id,
        executed_at,
        entries_processed,
        entry_ids,
        technician_ids,
        technician_names,
        success,
        error_message
      ) VALUES (
        COALESCE(v_org_id, (SELECT id FROM organizations LIMIT 1)),
        v_execution_start,
        0,
        '{}',
        '{}',
        '{}',
        false,
        SQLERRM
      );
    EXCEPTION
      WHEN OTHERS THEN
        NULL;
    END;

    RETURN jsonb_build_object(
      'success', false,
      'message', 'Error: ' || SQLERRM,
      'entries_processed', 0
    );
END;
$$;

-- ============================================================
-- FIX 2: Recreate execute_scheduled_logout with correct
--         timezone-aware date calculation
-- ============================================================
CREATE OR REPLACE FUNCTION execute_scheduled_logout()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_schedule RECORD;
  v_configured_utc timestamptz;
  v_now_minute timestamptz;
  v_sessions_closed integer := 0;
  v_tokens_revoked integer := 0;
  v_local_today date;
BEGIN
  -- Load the schedule configuration
  SELECT * INTO v_schedule
  FROM public.session_logout_schedule
  LIMIT 1;

  -- If no schedule row or not enabled, skip
  IF v_schedule IS NULL OR NOT v_schedule.enabled THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'Schedule disabled or not configured');
  END IF;

  -- FIX: Use the local date in the configured timezone (not the UTC server date).
  -- At midnight Chicago (06:00 UTC), current_date is already the NEXT day in UTC,
  -- so we must base the comparison on the local clock date.
  v_local_today := (now() AT TIME ZONE v_schedule.timezone)::date;

  -- Convert the configured logout_time + local date + timezone to a UTC timestamp
  v_configured_utc := (
    (v_local_today::text || ' ' || v_schedule.logout_time::text)::timestamp
    AT TIME ZONE v_schedule.timezone
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

  -- Log to session_cleanup_log
  INSERT INTO public.session_cleanup_log (sessions_closed, success)
  VALUES (v_sessions_closed, true);

  RETURN jsonb_build_object(
    'success', true,
    'sessions_closed', v_sessions_closed,
    'tokens_revoked', v_tokens_revoked,
    'executed_at', now()
  );

EXCEPTION WHEN OTHERS THEN
  BEGIN
    INSERT INTO public.session_cleanup_log (sessions_closed, success, error_message)
    VALUES (0, false, SQLERRM);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RAISE WARNING 'execute_scheduled_logout error: %', SQLERRM;
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
