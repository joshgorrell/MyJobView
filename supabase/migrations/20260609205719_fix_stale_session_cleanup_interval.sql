
-- Reduce stale session timeout from 4 hours to 30 minutes
CREATE OR REPLACE FUNCTION public.cleanup_stale_sessions()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE user_sessions
  SET
    is_active = false,
    session_end = last_activity + INTERVAL '30 minutes'
  WHERE is_active = true
    AND last_activity < now() - INTERVAL '30 minutes';
END;
$function$;

-- Run cleanup immediately to clear currently stale sessions
SELECT public.cleanup_stale_sessions();
