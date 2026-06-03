/*
  # Fix time_entries company_id default

  ## Problem
  The `time_entries` table has a `company_id` column that is NOT NULL but has no default value
  and no foreign key constraint pointing anywhere. Every INSERT fails with a null-violation
  unless `company_id` is explicitly provided — but no application code (CSV import, manual entry,
  work center, etc.) provides it.

  ## Fix
  Set the default for `company_id` to `get_user_org_id()` so it is automatically populated
  from the authenticated user's organization, matching the pattern used by `organization_id`.
  
  For any existing rows (there are none currently), no backfill is needed.
*/

ALTER TABLE time_entries
  ALTER COLUMN company_id SET DEFAULT get_user_org_id();
