/*
  # Fix Contact Type System - Single Source of Truth

  ## Summary
  Cleans up the contact type system so a contact is unambiguously ONE of three
  sales statuses: prospect, lead, or customer. Previously, a contact could be
  contact_type='lead' AND is_prospect=true simultaneously, causing contradictions.

  ## Changes

  ### 1. Fix Existing Data Contradictions
  - Corrects any contact with contact_type='lead' that also has is_prospect=true.

  ### 2. Fix the sync_is_prospect_flag Trigger
  - Old logic: is_prospect = contact_type IN ('prospect','lead') — WRONG.
  - New logic: is_prospect = (contact_type = 'prospect') only.

  ### 3. Fix Temperature Constraint
  - Adds 'on_fire' to allowed temperature values (was missing from DB).

  ### 4. Add Protective DB Constraint
  - Ensures is_prospect and contact_type can never contradict each other.

  ## Important Notes
  - After this migration, getContactType() logic is simple:
    - lead:     contact_type = 'lead'
    - prospect: contact_type = 'prospect'
    - customer: contact_type IN ('person', 'business')
  - is_prospect is now ONLY true when contact_type = 'prospect'
*/

-- 1. Fix existing data: any lead that has is_prospect=true gets corrected
UPDATE contacts
SET is_prospect = false
WHERE contact_type = 'lead' AND is_prospect = true;

-- 2. Drop all existing sync triggers and functions (CASCADE)
DROP TRIGGER IF EXISTS sync_is_prospect_flag_trigger ON contacts;
DROP TRIGGER IF EXISTS sync_is_prospect_trigger ON contacts;
DROP FUNCTION IF EXISTS sync_is_prospect_flag() CASCADE;

-- 3. Create the corrected sync function
CREATE OR REPLACE FUNCTION sync_is_prospect_flag()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- is_prospect is ONLY true for contact_type = 'prospect'
  -- leads and customers (person/business) all have is_prospect = false
  NEW.is_prospect := (NEW.contact_type = 'prospect');
  RETURN NEW;
END;
$$;

CREATE TRIGGER sync_is_prospect_flag_trigger
  BEFORE INSERT OR UPDATE OF contact_type ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION sync_is_prospect_flag();

-- 4. Re-sync all existing data to match the new rule
UPDATE contacts
SET is_prospect = (contact_type = 'prospect')
WHERE is_prospect != (contact_type = 'prospect');

-- 5. Fix the temperature constraint to include 'on_fire'
DO $$
BEGIN
  ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_temperature_check;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

ALTER TABLE contacts
  ADD CONSTRAINT contacts_temperature_check
  CHECK (temperature IN ('cold', 'warm', 'hot', 'on_fire'));

-- 6. Add protective constraint: is_prospect must always match contact_type='prospect'
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_prospect_consistency_check;
ALTER TABLE contacts
  ADD CONSTRAINT contacts_prospect_consistency_check
  CHECK (
    (contact_type = 'prospect' AND is_prospect = true) OR
    (contact_type != 'prospect' AND is_prospect = false)
  );

-- 7. Index for clean type-based queries
CREATE INDEX IF NOT EXISTS idx_contacts_type_status
  ON contacts(contact_type)
  WHERE contact_type IN ('lead', 'prospect');
