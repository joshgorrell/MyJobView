/*
  # Fix Punchlist Task Delete RLS Policy

  ## Summary
  Updates the DELETE policy for punchlist_tasks to allow both portal users and staff
  to delete tasks appropriately.

  ## Changes
  1. Portal users can delete their own draft tasks
  2. Staff can delete any task (for administrative purposes)

  ## Security
  - Portal users limited to deleting only draft status tasks
  - Staff have full delete permissions for administrative control
*/

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Portal users can delete their own draft tasks" ON punchlist_tasks;

-- Portal users can delete their own draft tasks
CREATE POLICY "Portal users can delete their own draft tasks"
  ON punchlist_tasks FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'portal_user'
      AND profiles.contact_id = punchlist_tasks.contact_id
    )
    AND status = 'draft'
  );

-- Staff can delete any task
CREATE POLICY "Staff can delete punchlist tasks"
  ON punchlist_tasks FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager', 'production_manager', 'dispatch')
    )
  );
