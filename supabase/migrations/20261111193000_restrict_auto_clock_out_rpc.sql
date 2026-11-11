-- Privileged scheduled payroll routines must not be exposed through PostgREST.
-- The pg_cron job executes as the database owner and retains access.
REVOKE ALL ON FUNCTION public.auto_clock_out_forgotten_entries_for_org(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auto_clock_out_forgotten_entries() FROM PUBLIC, anon, authenticated;
