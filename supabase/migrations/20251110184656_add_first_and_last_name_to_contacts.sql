/*
  # Add first_name and last_name to contacts

  1. Changes
    - Add `first_name` column to contacts table
    - Add `last_name` column to contacts table
    - Migrate existing `contact_name` data to first_name and last_name
    - Keep contact_name column for backward compatibility during transition

  2. Migration Strategy
    - Split existing contact_name into first_name and last_name
    - First word becomes first_name, remaining words become last_name
    - If only one word, it goes to first_name

  3. Notes
    - contact_name will eventually be deprecated but kept for now
    - New entries should use first_name and last_name directly
*/

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'first_name'
  ) THEN
    ALTER TABLE contacts ADD COLUMN first_name text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'last_name'
  ) THEN
    ALTER TABLE contacts ADD COLUMN last_name text;
  END IF;
END $$;

-- Migrate existing contact_name data to first_name and last_name
UPDATE contacts
SET 
  first_name = CASE 
    WHEN contact_name IS NOT NULL AND contact_name != '' THEN
      SPLIT_PART(contact_name, ' ', 1)
    ELSE NULL
  END,
  last_name = CASE 
    WHEN contact_name IS NOT NULL AND contact_name != '' 
      AND ARRAY_LENGTH(STRING_TO_ARRAY(contact_name, ' '), 1) > 1 THEN
      SUBSTRING(contact_name FROM LENGTH(SPLIT_PART(contact_name, ' ', 1)) + 2)
    ELSE NULL
  END
WHERE first_name IS NULL AND last_name IS NULL;

-- Create index for searching by name
CREATE INDEX IF NOT EXISTS idx_contacts_first_name ON contacts(first_name);
CREATE INDEX IF NOT EXISTS idx_contacts_last_name ON contacts(last_name);
