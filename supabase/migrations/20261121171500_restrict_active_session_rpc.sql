-- Prevent authenticated users from invoking an elevated function that
-- returns active sessions across organizations without tenant filtering.
-- Use a separately audited tenant-scoped reporting query instead.
REVOKE EXECUTE ON FUNCTION public.get_active_sessions_with_cleanup()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_sessions_with_cleanup()
  TO service_role;
