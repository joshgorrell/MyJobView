/*
  # Add Delete Policy for Bug Reports

  1. Changes
    - Add DELETE policy for bug_reports table
    - Allow all authenticated users to delete bug reports

  2. Security
    - Authenticated users can delete any bug report
    - Access is controlled via department module visibility (Bug Management module)
*/

-- Create DELETE policy for authenticated users
CREATE POLICY "Authenticated users can delete bug reports"
  ON bug_reports
  FOR DELETE
  TO authenticated
  USING (true);
