/*
# Grant table privileges on quickbooks_settings to authenticated

1. Modified Tables
- `quickbooks_settings`: grant SELECT, INSERT, UPDATE, DELETE to the
  `authenticated` role. RLS policies were already in place
  (quickbooks_settings_select_same_org, etc.) but the underlying table
  privileges were never granted, so the anon-key frontend could not
  read or write rows — the page silently showed "Not Connected" even
  though a healthy sandbox connection existed.

2. Security
- No policy changes. RLS remains enabled and the existing same-org
  policies still enforce that a user can only access rows belonging to
  their own organization. The grant only allows the role to reach the
  table; policies still gate every row.
- No grants to `anon` — this table is admin-only and requires an
  authenticated session.

3. Notes
- Idempotent: GRANT is safe to re-run.
- Does not touch the existing sandbox connection row or its tokens.
*/

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quickbooks_settings TO authenticated;