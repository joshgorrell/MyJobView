/*
  # Add Usernames for Mentions

  1. Changes
    - Add `username` column to profiles table (for @mentions of users)
    - Add `username` column to leads table (for @mentions of customers/leads)
    - Both fields are unique and required
    - Generate initial usernames from existing data
  
  2. Notes
    - Usernames are lowercase, alphanumeric only
    - Users can be mentioned and will receive notifications
    - Leads can be mentioned but won't receive notifications (display only)
    - Existing profiles will get auto-generated usernames
    - Existing leads will get auto-generated usernames
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'username'
  ) THEN
    ALTER TABLE profiles ADD COLUMN username text;
    
    UPDATE profiles 
    SET username = LOWER(REGEXP_REPLACE(full_name, '[^a-zA-Z0-9]', '', 'g'))
    WHERE username IS NULL;
    
    CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);
    
    ALTER TABLE profiles ALTER COLUMN username SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'username'
  ) THEN
    ALTER TABLE leads ADD COLUMN username text;
    
    UPDATE leads 
    SET username = LOWER(REGEXP_REPLACE(contact_name, '[^a-zA-Z0-9]', '', 'g'))
    WHERE username IS NULL;
    
    CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_username ON leads(username);
    
    ALTER TABLE leads ALTER COLUMN username SET NOT NULL;
  END IF;
END $$;
