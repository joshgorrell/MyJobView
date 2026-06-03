/*
  # Fix punchlist_task_photos RLS policies to use user_metadata

  ## Problem
  Same as punchlist_tasks - portal user policies checked 'app_metadata' but the
  JWT data is in 'user_metadata'. This caused photo uploads and photo views to fail
  for portal users.

  ## Changes
  - Drop portal-user policies that reference 'app_metadata'
  - Recreate them referencing 'user_metadata'
*/

DROP POLICY IF EXISTS "Portal users can insert photos for their tasks" ON punchlist_task_photos;
DROP POLICY IF EXISTS "Portal users can view photos for their tasks" ON punchlist_task_photos;

CREATE POLICY "Portal users can view photos for their tasks"
  ON punchlist_task_photos FOR SELECT
  TO authenticated
  USING (
    ((auth.jwt() -> 'user_metadata' ->> 'is_portal_user')::boolean = true)
    AND EXISTS (
      SELECT 1 FROM punchlist_tasks pt
      WHERE pt.id = punchlist_task_photos.task_id
        AND pt.contact_id = ((auth.jwt() -> 'user_metadata' ->> 'contact_id')::uuid)
    )
  );

CREATE POLICY "Portal users can insert photos for their tasks"
  ON punchlist_task_photos FOR INSERT
  TO authenticated
  WITH CHECK (
    ((auth.jwt() -> 'user_metadata' ->> 'is_portal_user')::boolean = true)
    AND organization_id = ((auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
    AND EXISTS (
      SELECT 1 FROM punchlist_tasks pt
      WHERE pt.id = punchlist_task_photos.task_id
        AND pt.contact_id = ((auth.jwt() -> 'user_metadata' ->> 'contact_id')::uuid)
    )
  );
