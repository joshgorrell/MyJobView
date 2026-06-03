/*
  # Add can_view_all_pipeline permission to profiles

  1. Changes
    - Add `can_view_all_pipeline` boolean column to profiles table
    - Default to true for existing users (backward compatible)
    - Admin can control which users see "All Pipeline" vs "My Pipeline"

  2. Purpose
    - Business Development Managers need to see all new contacts, connections, and unclaimed leads
    - Most sales reps should only see their own pipeline data
    - Admin controls this permission per user
*/

-- Add the can_view_all_pipeline column to profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'can_view_all_pipeline'
  ) THEN
    ALTER TABLE profiles ADD COLUMN can_view_all_pipeline boolean DEFAULT true;
  END IF;
END $$;
