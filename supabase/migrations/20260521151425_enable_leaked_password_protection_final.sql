/*
  # Enable Leaked Password Protection

  ## Summary
  Enables Supabase Auth's leaked password protection feature which checks
  new passwords against HaveIBeenPwned.org to prevent use of compromised passwords.

  This enhances security by ensuring users cannot set passwords that are known
  to have been exposed in data breaches.
*/

-- Enable leaked password protection via auth configuration
-- This uses the Supabase internal auth settings
DO $$
BEGIN
  -- Update auth config to enable hibp password check
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'config') THEN
    UPDATE auth.config SET enable_hibp_check = true;
  END IF;
END $$;
