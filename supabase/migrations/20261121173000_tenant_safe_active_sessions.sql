-- Replace privileged cross-tenant session listing with caller-RLS-scoped read.
-- Cleanup is scheduled separately; reading this RPC must never mutate sessions.
CREATE OR REPLACE FUNCTION public.get_active_sessions_with_cleanup()
RETURNS TABLE (
 id uuid, user_id uuid, session_start timestamptz, session_end timestamptz,
 last_activity timestamptz, ip_address text, user_agent text, is_active boolean,
 duration_seconds integer, device_type text, browser_name text,
 browser_version text, os_name text, os_version text,
 device_model text, device_vendor text
)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = ''
AS $$
 SELECT s.id,s.user_id,s.session_start,s.session_end,s.last_activity,
 s.ip_address,s.user_agent,s.is_active,s.duration_seconds,s.device_type,
 s.browser_name,s.browser_version,s.os_name,s.os_version,
 s.device_model,s.device_vendor
 FROM public.user_sessions AS s
 WHERE s.is_active = true
   AND s.last_activity >= now() - interval '5 minutes'
 ORDER BY s.last_activity DESC
$$;
REVOKE EXECUTE ON FUNCTION public.get_active_sessions_with_cleanup() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_active_sessions_with_cleanup() TO authenticated, service_role;
