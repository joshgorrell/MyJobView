/*
  # Add Calendar Access Control

  ## Changes
  1. Add `has_calendar_access` field to profiles table
    - Boolean field, defaults to true
    - Allows admins to hide calendar access per user

  ## Purpose
  - Enable per-user calendar access control
  - All users have calendar access by default
  - Admins can disable calendar access for specific users if needed

  ## Security
  - No RLS changes needed - existing policies cover this field
  - Only admins can update this field through admin interface
*/

-- Add has_calendar_access field to profiles table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'has_calendar_access'
  ) THEN
    ALTER TABLE profiles ADD COLUMN has_calendar_access boolean DEFAULT true NOT NULL;
  END IF;
END $$;

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_profiles_calendar_access ON profiles(has_calendar_access) WHERE has_calendar_access = true;
