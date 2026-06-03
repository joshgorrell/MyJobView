/*
  # Fix Bug Reports Insert Policy

  1. Changes
    - Restore INSERT policy for bug_reports table
    - Allow authenticated users to create bug reports

  2. Security
    - Users can only insert bug reports with their own user_id
    - Prevents users from creating bug reports on behalf of others
*/

-- Drop any existing insert policy (in case it exists)
DROP POLICY IF EXISTS "Authenticated users can create bug reports" ON bug_reports;

-- Create INSERT policy for authenticated users
CREATE POLICY "Authenticated users can create bug reports"
  ON bug_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
