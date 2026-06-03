/*
  # Add Per-User Job Module Setting

  1. Changes
    - Add `job_module_enabled` column to `profiles` table
    - Defaults to `false` so only users who opt-in can see it
    - Users can enable it independently of company setting
    - The feature will be visible if EITHER company OR user setting is enabled

  2. Security
    - Users can update their own job_module_enabled setting
    - No RLS changes needed (existing policies allow users to update their own profiles)
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