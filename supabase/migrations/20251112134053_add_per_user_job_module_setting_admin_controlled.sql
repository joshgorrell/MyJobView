/*
  # Add Admin-Controlled Per-User Job Module Setting

  1. Changes
    - Add `job_module_enabled` column to `profiles` table
    - Defaults to `false`
    - Only admins can modify this setting for users
    - Users will see the Jobs Module if their individual setting is enabled

  2. Security
    - Existing RLS policies allow admins to update all profiles
    - Users can read their own profile to check the setting
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name = 'job_module_enabled'
  ) THEN
    ALTER TABLE profiles ADD COLUMN job_module_enabled boolean DEFAULT false;
  END IF;
END $$;