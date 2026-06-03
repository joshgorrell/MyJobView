/*
  # Fix Bug Reports Access for All Authenticated Users

  1. Changes
    - Update RLS policies to allow all authenticated users to view all bug reports
    - Update RLS policies to allow all authenticated users to update bug reports
    - Keep notification settings admin-only
    - Access control is now managed via department module visibility

  2. Security
    - Authenticated users can view all bug reports
    - Authenticated users can mark bug reports as fixed
    - Only admins can configure notification settings
    - Users can still create bug reports
*/

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can view own bug reports" ON bug_reports;
DROP POLICY IF EXISTS "Admins can view all bug reports" ON bug_reports;
DROP POLICY IF EXISTS "Admins can update bug reports" ON bug_reports;

-- Create new permissive policies for authenticated users
CREATE POLICY "Authenticated users can view all bug reports"
  ON bug_reports
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can update bug reports"
  ON bug_reports
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Keep the existing insert policy unchanged
-- CREATE POLICY "Authenticated users can create bug reports"
--   ON bug_reports
--   FOR INSERT
--   TO authenticated
--   WITH CHECK (auth.uid() = user_id);
