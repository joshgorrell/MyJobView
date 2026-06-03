/*
  # Add can_view_all_tasks permission to profiles
  
  1. Changes
    - Add `can_view_all_tasks` boolean column to profiles table
    - Default to true for existing users to maintain current behavior
    - Admin users can control this per-user setting
  
  2. Security
    - No RLS changes needed - this is just a setting column
*/

-- Add the can_view_all_tasks column to profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'can_view_all_tasks'
  ) THEN
    ALTER TABLE profiles ADD COLUMN can_view_all_tasks boolean DEFAULT true;
  END IF;
END $$;