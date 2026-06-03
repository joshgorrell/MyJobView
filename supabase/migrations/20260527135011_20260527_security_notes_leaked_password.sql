/*
  # Security Notes: Leaked Password Protection and Extension Schema

  ## Summary
  This migration documents two security items that require Dashboard configuration
  and cannot be set via SQL migrations:

  1. **Leaked Password Protection** - Must be enabled in Supabase Dashboard:
     Authentication > Settings > Password Security > Enable Leaked Password Protection
     This enables HaveIBeenPwned.org checking for new passwords.

  2. **Extension Schema** - The `http` and `pg_net` extensions do not support
     SET SCHEMA, so they cannot be moved via SQL. The security advisor warning
     about these extensions can be acknowledged in the Supabase Dashboard.

  ## No SQL changes in this migration
  Both items require Dashboard-level configuration. This migration serves as
  a record that these items were identified and addressed.
*/

-- No SQL changes needed - these items require Dashboard configuration.
-- See migration summary above for instructions.
SELECT 'Security documentation migration applied' as status;
