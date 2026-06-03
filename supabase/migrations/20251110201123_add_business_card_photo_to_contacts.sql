/*
  # Add Business Card Photo to Contacts

  1. Changes
    - Add `business_card_photo_url` column to `contacts` table
    - Column stores the URL of the uploaded business card photo
  
  2. Notes
    - Uses text type for storing photo URLs
    - Nullable to support existing contacts without photos
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'business_card_photo_url'
  ) THEN
    ALTER TABLE contacts ADD COLUMN business_card_photo_url text;
  END IF;
END $$;