/*
  # Add Title and Business Phone to Contacts

  1. Changes
    - Add `title` column to contacts table (e.g., "CEO", "Sales Manager")
    - Add `business_phone` column to contacts table
    - Rename `phone` column display to be treated as cell phone
  
  2. Notes
    - Existing `phone` column remains unchanged in database (will be treated as cell phone in UI)
    - New columns are nullable to support existing records
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'title'
  ) THEN
    ALTER TABLE contacts ADD COLUMN title text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'business_phone'
  ) THEN
    ALTER TABLE contacts ADD COLUMN business_phone text;
  END IF;
END $$;