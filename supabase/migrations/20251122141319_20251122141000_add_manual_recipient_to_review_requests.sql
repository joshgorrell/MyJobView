/*
  # Add Manual Recipient Fields to Review Requests

  1. Changes
    - Add recipient_email column to store email for non-contact recipients
    - Add recipient_name column to store name for non-contact recipients
    - Make contact_id nullable since we can now send to anyone
    - Update constraint to ensure either contact_id OR recipient_email exists

  2. Notes
    - Allows sending review requests to anyone, not just existing contacts
    - Maintains tracking for ad-hoc review requests
*/

-- Make contact_id nullable
ALTER TABLE review_requests 
  ALTER COLUMN contact_id DROP NOT NULL;

-- Add recipient fields for manual entry
ALTER TABLE review_requests 
  ADD COLUMN IF NOT EXISTS recipient_email text,
  ADD COLUMN IF NOT EXISTS recipient_name text;

-- Add check constraint to ensure either contact_id or recipient_email exists
ALTER TABLE review_requests 
  DROP CONSTRAINT IF EXISTS review_requests_recipient_check;

ALTER TABLE review_requests 
  ADD CONSTRAINT review_requests_recipient_check 
  CHECK (
    (contact_id IS NOT NULL) OR 
    (recipient_email IS NOT NULL)
  );
