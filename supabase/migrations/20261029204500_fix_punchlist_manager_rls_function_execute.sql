-- Production storage logs (2026-10-29) showed SQLSTATE 42501:
-- permission denied for function private.punchlist_grant_manager
-- while authenticated employees uploaded their own business card photo.
-- The punchlist_access_grants ALL policy invokes this private role/organization
-- predicate; the function itself enforces active employee and manager checks.
-- Keep the predicate and RLS intact; grant only function invocation.
GRANT EXECUTE ON FUNCTION private.punchlist_grant_manager(uuid) TO authenticated;
