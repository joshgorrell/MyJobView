/*
  # Require Office on All Contacts

  ## Summary
  Assigns all existing contacts without an office to the Topeka office, then
  enforces a NOT NULL constraint so every contact must belong to an office going forward.

  ## Changes

  ### Modified Tables
  - `contacts`
    - All 33 rows with `office_id IS NULL` are updated to the Topeka office id
    - `office_id` column is altered to NOT NULL

  ## Notes
  1. The Topeka office id is `d3ab3833-c1bc-44fa-a628-0a55e50f3bb2`
  2. A foreign key from contacts.office_id to company_offices.id already exists
     (added in an earlier migration), so no new FK is needed
  3. No data is deleted; this is a non-destructive backfill + constraint tightening
*/

UPDATE contacts
SET office_id = 'd3ab3833-c1bc-44fa-a628-0a55e50f3bb2'
WHERE office_id IS NULL;

ALTER TABLE contacts
  ALTER COLUMN office_id SET NOT NULL;
