/*
  # Add Delete Policy for Time Clock Entries

  1. Security
    - Add DELETE policy for daily_clock_entries table
    - Only admins, office managers, production managers, and service managers can delete entries
    - This allows authorized staff to remove incorrect or duplicate time entries

  2. Changes
    - Add RLS policy for DELETE operations on daily_clock_entries
*/

-- Add DELETE policy for time clock entries
CREATE POLICY "Authorized staff can delete time entries"
  ON daily_clock_entries
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager', 'production_manager', 'service_manager')
    )
  );

COMMENT ON POLICY "Authorized staff can delete time entries" ON daily_clock_entries IS
'Allows admins and managers to delete time clock entries. Useful for removing duplicate or incorrect entries.';
