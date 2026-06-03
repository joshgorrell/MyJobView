/*
  # Rename Jobs Module to MyJobView

  1. Changes
    - Rename `job_module_enabled` column to `my_job_view_enabled` in `profiles` table
    - This is a simple column rename to reflect the new branding

  2. Security
    - No RLS changes needed
*/

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name = 'job_module_enabled'
  ) THEN
    ALTER TABLE profiles RENAME COLUMN job_module_enabled TO my_job_view_enabled;
  END IF;
END $$;