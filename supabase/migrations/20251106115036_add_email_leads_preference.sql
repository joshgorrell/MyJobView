/*
  # Add Email Leads Preference to Profiles

  1. Changes
    - Add `email_leads` column to profiles table
      - Boolean field to indicate if user wants email notifications for new leads
      - Defaults to false (opt-in)
    
  2. Notes
    - Non-destructive migration using IF NOT EXISTS pattern
    - Existing users will have email_leads set to false by default
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'email_leads'
  ) THEN
    ALTER TABLE profiles ADD COLUMN email_leads boolean DEFAULT false;
  END IF;
END $$;
