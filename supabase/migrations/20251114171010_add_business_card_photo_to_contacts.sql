/*
  # Add Business Card Photo to Contacts

  1. Changes
    - Adds `business_card_photo` field to contacts table to store scanned business card images
    - Field stores the file path/URL to the uploaded business card image
    - Field is optional (nullable) as not all contacts will have scanned cards

  2. Notes
    - Photos will be stored in the existing contact_business_cards storage bucket
    - No RLS changes needed - existing contact policies apply to this field
*/

-- Add business_card_photo field to contacts table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'business_card_photo'
  ) THEN
    ALTER TABLE contacts ADD COLUMN business_card_photo text;
  END IF;
END $$;