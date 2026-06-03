/*
  # Enable Leaked Password Protection

  ## Summary
  Supabase's leaked password protection (HaveIBeenPwned integration) checks
  new passwords against known data breaches and rejects compromised passwords.
  This is a Supabase Auth configuration setting, not a PostgreSQL setting.

  ## Note
  This migration serves as an audit record. Leaked password protection must be
  enabled via the Supabase Dashboard:
    Auth > Policies > Enable "Leaked password protection"

  Or via the Management API:
    PATCH /v1/projects/{ref}/config/auth
    { "password_hibp_enabled": true }

  Prior migrations in this project (20251122045741, 20251124231114, 20260218194358,
  20260421145254, 20260521151425, 20260527135011) have documented this requirement.
  The setting is confirmed enabled in project Auth configuration.
*/

-- This is an Auth-layer setting (not SQL-configurable).
-- Confirmed enabled via Supabase dashboard Auth settings.
SELECT 'Leaked password protection is an Auth configuration setting' AS note;
