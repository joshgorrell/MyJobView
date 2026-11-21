-- Restore scheduled application-session cleanup without deleting session history.
-- Application session activity is not a substitute for Supabase Auth token validity.
REVOKE INSERT ON TABLE public.session_cleanup_log FROM authenticated;
DROP POLICY IF EXISTS session_cleanup_log_insert_same_org ON public.session_cleanup_log;

-- The existing SECURITY DEFINER RPC is intended for privileged scheduling only.
REVOKE ALL ON FUNCTION public.midnight_session_cleanup() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.midnight_session_cleanup() TO service_role;

-- Do not duplicate the job on repeated deployment.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mJV-session-stale-cleanup') THEN
    PERFORM cron.schedule(
      'mJV-session-stale-cleanup',
      '*/15 * * * *',
      'SELECT public.midnight_session_cleanup();'
    );
  END IF;
END;
$$;
