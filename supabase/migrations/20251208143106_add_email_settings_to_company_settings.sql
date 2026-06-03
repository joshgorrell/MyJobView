/*
  # Add Email Settings to Company Settings

  1. Changes
    - Add `from_email` column for the email address used in "From" field
    - Add `from_name` column for the display name in emails
    - Add `reply_to_email` column for reply-to address
    
  2. Notes
    - These fields are used by Resend to send emails
    - The `from_email` must match a verified domain in Resend
*/

-- Add email settings columns
ALTER TABLE company_settings
ADD COLUMN IF NOT EXISTS from_email text,
ADD COLUMN IF NOT EXISTS from_name text,
ADD COLUMN IF NOT EXISTS reply_to_email text;
