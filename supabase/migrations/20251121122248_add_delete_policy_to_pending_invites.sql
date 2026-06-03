/*
  # Add Delete Policy to Pending Punchlist Invites

  ## Summary
  Adds a DELETE policy to the pending_punchlist_invites table to allow staff
  to delete invites when needed.

  ## Changes
  - Add DELETE policy for admin, sales_manager, office_manager, and project_manager roles
*/

-- Add delete policy for staff
CREATE POLICY "Staff can delete pending invites"
  ON pending_punchlist_invites FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'sales_manager', 'office_manager', 'project_manager')
    )
  );
