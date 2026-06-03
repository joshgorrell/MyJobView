/*
  # Fix punchlist_tasks RLS policies to use user_metadata from JWT

  ## Problem
  Portal user metadata is stored in `raw_user_meta_data` on auth.users.
  In the JWT, this appears under `user_metadata`, NOT at the top level.
  So the correct path is: auth.jwt()->'user_metadata'->>'is_portal_user'
  NOT: auth.jwt()->>'is_portal_user'

  ## Changes
  - Drop and recreate all portal-user punchlist_tasks policies with correct JWT path
  - Drop and recreate punchlist_task_photos portal policies with correct JWT path
*/

-- Fix punchlist_tasks INSERT policies
DROP POLICY IF EXISTS "Portal users can insert own punchlist tasks via metadata" ON punchlist_tasks;
DROP POLICY IF EXISTS "punchlist_tasks_insert_same_org" ON punchlist_tasks;

CREATE POLICY "Portal users can insert own punchlist tasks via metadata"
  ON punchlist_tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt()->'user_metadata'->>'is_portal_user')::boolean = true
    AND contact_id = (auth.jwt()->'user_metadata'->>'contact_id')::uuid
    AND organization_id = (auth.jwt()->'user_metadata'->>'organization_id')::uuid
  );

CREATE POLICY "punchlist_tasks_insert_same_org"
  ON punchlist_tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id = get_user_org_id()
    OR (
      (auth.jwt()->'user_metadata'->>'is_portal_user')::boolean = true
      AND organization_id = (auth.jwt()->'user_metadata'->>'organization_id')::uuid
    )
  );

-- Fix punchlist_tasks SELECT policy
DROP POLICY IF EXISTS "Portal users can view their own punchlist tasks" ON punchlist_tasks;

CREATE POLICY "Portal users can view their own punchlist tasks"
  ON punchlist_tasks
  FOR SELECT
  TO authenticated
  USING (
    (auth.jwt()->'user_metadata'->>'is_portal_user')::boolean = true
    AND contact_id = (auth.jwt()->'user_metadata'->>'contact_id')::uuid
  );

-- Fix punchlist_tasks UPDATE policy
DROP POLICY IF EXISTS "Portal users can update their own punchlist tasks" ON punchlist_tasks;

CREATE POLICY "Portal users can update their own punchlist tasks"
  ON punchlist_tasks
  FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt()->'user_metadata'->>'is_portal_user')::boolean = true
    AND contact_id = (auth.jwt()->'user_metadata'->>'contact_id')::uuid
  )
  WITH CHECK (
    (auth.jwt()->'user_metadata'->>'is_portal_user')::boolean = true
    AND contact_id = (auth.jwt()->'user_metadata'->>'contact_id')::uuid
  );

-- Fix punchlist_tasks DELETE policy
DROP POLICY IF EXISTS "Portal users can delete their own draft tasks" ON punchlist_tasks;

CREATE POLICY "Portal users can delete their own draft tasks"
  ON punchlist_tasks
  FOR DELETE
  TO authenticated
  USING (
    (auth.jwt()->'user_metadata'->>'is_portal_user')::boolean = true
    AND contact_id = (auth.jwt()->'user_metadata'->>'contact_id')::uuid
    AND status = 'draft'
  );

-- Fix punchlist_task_photos policies
DROP POLICY IF EXISTS "Portal users can view photos for their tasks" ON punchlist_task_photos;
DROP POLICY IF EXISTS "Portal users can insert photos for their tasks" ON punchlist_task_photos;

CREATE POLICY "Portal users can view photos for their tasks"
  ON punchlist_task_photos
  FOR SELECT
  TO authenticated
  USING (
    (auth.jwt()->'user_metadata'->>'is_portal_user')::boolean = true
    AND EXISTS (
      SELECT 1 FROM punchlist_tasks pt
      WHERE pt.id = punchlist_task_photos.task_id
        AND pt.contact_id = (auth.jwt()->'user_metadata'->>'contact_id')::uuid
    )
  );

CREATE POLICY "Portal users can insert photos for their tasks"
  ON punchlist_task_photos
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt()->'user_metadata'->>'is_portal_user')::boolean = true
    AND organization_id = (auth.jwt()->'user_metadata'->>'organization_id')::uuid
    AND EXISTS (
      SELECT 1 FROM punchlist_tasks pt
      WHERE pt.id = punchlist_task_photos.task_id
        AND pt.contact_id = (auth.jwt()->'user_metadata'->>'contact_id')::uuid
    )
  );
