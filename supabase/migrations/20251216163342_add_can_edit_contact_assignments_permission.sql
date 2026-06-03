/*
  # Add can_edit_contact_assignments permission
  
  1. Changes
    - Add `can_edit_contact_assignments` boolean column to profiles table
    - Defaults to false for existing users
    - Admins will inherently have this ability
  
  2. Purpose
    - Allow granular control over who can reassign contacts to different sales reps
    - Can be granted to sales managers, team leads, or other roles as needed
*/

-- Add the can_edit_contact_assignments column to profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'can_edit_contact_assignments'
  ) THEN
    ALTER TABLE profiles ADD COLUMN can_edit_contact_assignments boolean DEFAULT false;
  END IF;
END $$;

-- Set to true for all existing admin users
UPDATE profiles 
SET can_edit_contact_assignments = true 
WHERE role = 'admin';
