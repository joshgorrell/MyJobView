/*
  # Add vip_signup to punchlist_access_grants access_type constraint

  The access_type check constraint was missing 'vip_signup' as an allowed value.
  This caused inserts for VIP Signup invites to fail silently on the frontend
  (the error was swallowed) and meant no grant record was ever persisted.

  ## Changes
  - Drop the existing access_type check constraint
  - Recreate it with 'vip_signup' included
*/

ALTER TABLE punchlist_access_grants
  DROP CONSTRAINT IF EXISTS punchlist_access_grants_access_type_check;

ALTER TABLE punchlist_access_grants
  ADD CONSTRAINT punchlist_access_grants_access_type_check
  CHECK (access_type IN ('test_and_tune', 'promotional', 'vip_signup'));
