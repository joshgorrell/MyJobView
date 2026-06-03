/*
  # Add tax_jurisdiction_id to contacts table

  ## Summary
  Links each contact to a specific sales tax jurisdiction record, enabling
  accurate and auditable tax jurisdiction tracking per customer.

  ## Changes

  ### Modified Tables
  - `contacts`
    - Added `tax_jurisdiction_id` (uuid, nullable FK → tax_jurisdictions.id)
      Stores the specific jurisdiction whose rate applies to this contact.

  ## Notes
  - Column is nullable to avoid breaking existing records.
  - Application layer enforces it as required for non-exempt contacts.
  - Backfill: attempts to match existing contacts by zip_code lookup.
  - Contacts without a zip match fall back to the default jurisdiction.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'tax_jurisdiction_id'
  ) THEN
    ALTER TABLE contacts
      ADD COLUMN tax_jurisdiction_id uuid REFERENCES tax_jurisdictions(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_contacts_tax_jurisdiction_id
  ON contacts(tax_jurisdiction_id);

UPDATE contacts c
SET tax_jurisdiction_id = tj.id
FROM tax_jurisdictions tj
WHERE c.tax_jurisdiction_id IS NULL
  AND c.zip_code IS NOT NULL
  AND tj.zip_code = c.zip_code
  AND tj.is_active = true;

UPDATE contacts c
SET tax_jurisdiction_id = tj.id
FROM tax_jurisdictions tj
WHERE c.tax_jurisdiction_id IS NULL
  AND tj.is_default = true;
