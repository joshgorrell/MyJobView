/*
  # Add portal user access to punchlist_task_photos

  Portal users need to be able to view and upload photos for their own tasks.
  Uses auth.jwt() to read portal user metadata safely.
*/

CREATE POLICY "Portal users can view photos for their tasks"
  ON punchlist_task_photos
  FOR SELECT
  TO authenticated
  USING (
    (auth.jwt()->>'is_portal_user')::boolean = true
    AND EXISTS (
      SELECT 1 FROM punchlist_tasks pt
      WHERE pt.id = punchlist_task_photos.task_id
        AND pt.contact_id = (auth.jwt()->>'contact_id')::uuid
    )
  );

CREATE POLICY "Portal users can insert photos for their tasks"
  ON punchlist_task_photos
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt()->>'is_portal_user')::boolean = true
    AND organization_id = (auth.jwt()->>'organization_id')::uuid
    AND EXISTS (
      SELECT 1 FROM punchlist_tasks pt
      WHERE pt.id = punchlist_task_photos.task_id
        AND pt.contact_id = (auth.jwt()->>'contact_id')::uuid
    )
  );
