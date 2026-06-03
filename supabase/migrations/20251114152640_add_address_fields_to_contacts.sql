/*
  # Add Address Fields to Contacts

  1. Changes
    - Add address fields to contacts table:
      - `street_address` (text, optional)
      - `city` (text, optional)
      - `state` (text, optional)
      - `zip_code` (text, optional)
      - `country` (text, optional, default 'USA')
    
  2. Notes
    - All address fields are optional to maintain backwards compatibility
    - Existing contacts will have NULL values for these fields
    - No RLS changes needed as contacts table already has proper policies
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'street_address'
  ) THEN
    ALTER TABLE contacts ADD COLUMN street_address text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'city'
  ) THEN
    ALTER TABLE contacts ADD COLUMN city text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'state'
  ) THEN
    ALTER TABLE contacts ADD COLUMN state text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'zip_code'
  ) THEN
    ALTER TABLE contacts ADD COLUMN zip_code text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'country'
  ) THEN
    ALTER TABLE contacts ADD COLUMN country text DEFAULT 'USA';
  END IF;
END $$;