/*
  # Enable Leaked Password Protection

  ## Summary
  Enables HaveIBeenPwned (HIBP) integration in Supabase Auth to prevent users
  from using passwords that have been exposed in known data breaches.

  This is a security configuration note - the actual setting is managed through
  the Supabase dashboard Auth settings. This migration documents the requirement.

  Note: The leaked_password_protection setting must be enabled in the Supabase
  Auth configuration via the dashboard under Authentication > Settings >
  "Enable leaked password protection".
*/

DO $$
BEGIN
  RAISE NOTICE 'Leaked password protection should be enabled in Supabase Auth dashboard under Authentication > Settings.';
END $$;
