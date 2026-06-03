/*
  # Add Recur Module Permission

  1. Changes
    - Add can_access_recur column to profiles table
    - Default to false for all users
    - Admin can enable/disable per user
*/

-- Add recur module permission column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'can_access_recur'
  ) THEN
    ALTER TABLE profiles ADD COLUMN can_access_recur BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Set default to false for all existing users
UPDATE profiles
SET can_access_recur = false
WHERE can_access_recur IS NULL;
