/*
  # Enable Leaked Password Protection
  
  Note: Leaked password protection must be enabled through the Supabase Dashboard.
  This cannot be configured via SQL migrations.
  
  ## Action Required
  To enable leaked password protection:
  
  1. Go to Supabase Dashboard
  2. Navigate to Authentication > Settings
  3. Scroll to "Password Protection"
  4. Enable "Check for leaked passwords"
  
  This will integrate with HaveIBeenPwned.org to prevent users from using
  compromised passwords, significantly improving security.
  
  ## Benefits
  - Prevents use of passwords found in data breaches
  - Reduces account takeover risk
  - Meets security compliance requirements
  - No impact on user experience for strong passwords
*/

-- This migration serves as documentation only
-- No SQL changes required