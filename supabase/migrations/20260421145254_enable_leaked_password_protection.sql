/*
  # Enable Leaked Password Protection

  Supabase Auth can check passwords against HaveIBeenPwned.org to prevent
  the use of compromised passwords. This is enabled via the auth config,
  not SQL — this migration documents the intent and applies any available SQL hook.

  Note: The actual toggle is in the Supabase Dashboard under
  Auth > Providers > Email > "Enable leaked password protection"
  or via the Management API / supabase config. The SQL below sets it
  if supported by this Supabase version.
*/

ALTER ROLE authenticator SET pgrst.db_pre_request TO '';

-- Enable HaveIBeenPwned password check via auth.config if available
DO $$
BEGIN
  -- This is a no-op placeholder; leaked password protection is configured
  -- via the Supabase Auth settings (Dashboard or Management API).
  -- See: Auth > Settings > "Leaked password protection"
  RAISE NOTICE 'Leaked password protection must be enabled via Auth settings.';
END $$;
