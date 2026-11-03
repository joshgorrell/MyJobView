-- Authenticated callers need this predicate for the staff-only row policies.
-- It reveals only whether the current caller is active staff in the supplied org.
REVOKE ALL ON FUNCTION private.punchlist_staff_identity(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.punchlist_staff_identity(uuid) TO authenticated;
