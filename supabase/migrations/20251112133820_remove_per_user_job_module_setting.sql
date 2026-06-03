/*
  # Remove Per-User Job Module Setting

  1. Changes
    - Drop `job_module_enabled` column from `profiles` table
    - Job module visibility will only be controlled by company settings (admin-only)

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
    ALTER TABLE profiles DROP COLUMN job_module_enabled;
  END IF;
END $$;