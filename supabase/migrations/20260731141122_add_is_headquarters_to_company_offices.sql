/*
# Add Headquarters Flag to Company Offices

1. Modified Tables
- `company_offices`
  - Adds `is_headquarters` boolean column (default false).
  - Adds a partial unique index so at most one office per organization can be the headquarters.

2. Security
- No RLS policy changes. Existing policies on `company_offices` remain unchanged.

3. Notes
- The column is nullable=false with default false so existing rows are treated as non-HQ.
- The unique index is scoped per `organization_id` (if present) so multi-tenant installs can have one HQ per org.
- If `organization_id` does not exist on the table, the index is unscoped (one HQ globally), which is fine for single-tenant installs.
*/

ALTER TABLE company_offices
  ADD COLUMN IF NOT EXISTS is_headquarters boolean NOT NULL DEFAULT false;

-- Ensure at most one headquarters per organization (or globally if no org column).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_offices' AND column_name = 'organization_id'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes WHERE indexname = 'company_offices_one_headquarters_per_org'
    ) THEN
      EXECUTE 'CREATE UNIQUE INDEX company_offices_one_headquarters_per_org
               ON company_offices (organization_id)
               WHERE is_headquarters = true';
    END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes WHERE indexname = 'company_offices_one_headquarters'
    ) THEN
      EXECUTE 'CREATE UNIQUE INDEX company_offices_one_headquarters
               ON company_offices ((1))
               WHERE is_headquarters = true';
    END IF;
  END IF;
END $$;
