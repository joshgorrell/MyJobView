/*
  # Fix invoices company_id default

  ## Problem
  The `company_id` column on the `invoices` table has no default value and is NOT NULL,
  causing inserts to fail when the frontend passes NULL (because profile.company_id
  was removed when the codebase migrated to organization_id).

  ## Fix
  Set the default for `company_id` to `get_user_org_id()` so it is automatically
  populated from the authenticated user's organization, matching the pattern already
  used on `organization_id` in the same table.
*/

ALTER TABLE invoices
  ALTER COLUMN company_id SET DEFAULT get_user_org_id();
