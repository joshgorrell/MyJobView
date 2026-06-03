/*
  # Fix Punchlist RLS Policies — Replace user_metadata with app_metadata

  Security issue: Several RLS policies on punchlist_tasks and punchlist_task_photos
  read portal user identity from auth.jwt() -> 'user_metadata', which is editable
  by end users and must never be trusted for security decisions.

  Fix: Replace all references to 'user_metadata' with 'app_metadata', which is
  only writable by the service role / admin and is safe to use in security contexts.

  Affected policies on punchlist_tasks:
  - Portal users can view their own punchlist tasks (SELECT)
  - Portal users can insert own punchlist tasks via metadata (INSERT)
  - punchlist_tasks_insert_same_org (INSERT) — has a combined user_metadata branch
  - Portal users can update their own punchlist tasks (UPDATE)
  - Portal users can delete their own draft tasks (DELETE)

  Affected policies on punchlist_task_photos:
  - Portal users can view photos for their tasks (SELECT)
  - Portal users can insert photos for their tasks (INSERT)
*/

-- ============================================================
-- punchlist_tasks
-- ============================================================

-- SELECT
DROP POLICY IF EXISTS "Portal users can view their own punchlist tasks" ON punchlist_tasks;
CREATE POLICY "Portal users can view their own punchlist tasks"
  ON punchlist_tasks
  FOR SELECT
  TO authenticated
  USING (
    ((auth.jwt() -> 'app_metadata' ->> 'is_portal_user')::boolean = true)
    AND contact_id = ((auth.jwt() -> 'app_metadata' ->> 'contact_id')::uuid)
  );

-- INSERT (dedicated portal policy)
DROP POLICY IF EXISTS "Portal users can insert own punchlist tasks via metadata" ON punchlist_tasks;
CREATE POLICY "Portal users can insert own punchlist tasks via metadata"
  ON punchlist_tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    ((auth.jwt() -> 'app_metadata' ->> 'is_portal_user')::boolean = true)
    AND contact_id = ((auth.jwt() -> 'app_metadata' ->> 'contact_id')::uuid)
    AND organization_id = ((auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid)
  );

-- INSERT (combined org policy — staff OR portal users)
DROP POLICY IF EXISTS "punchlist_tasks_insert_same_org" ON punchlist_tasks;
CREATE POLICY "punchlist_tasks_insert_same_org"
  ON punchlist_tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id = get_user_org_id()
    OR (
      ((auth.jwt() -> 'app_metadata' ->> 'is_portal_user')::boolean = true)
      AND organization_id = ((auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid)
    )
  );

-- UPDATE
DROP POLICY IF EXISTS "Portal users can update their own punchlist tasks" ON punchlist_tasks;
CREATE POLICY "Portal users can update their own punchlist tasks"
  ON punchlist_tasks
  FOR UPDATE
  TO authenticated
  USING (
    ((auth.jwt() -> 'app_metadata' ->> 'is_portal_user')::boolean = true)
    AND contact_id = ((auth.jwt() -> 'app_metadata' ->> 'contact_id')::uuid)
  )
  WITH CHECK (
    ((auth.jwt() -> 'app_metadata' ->> 'is_portal_user')::boolean = true)
    AND contact_id = ((auth.jwt() -> 'app_metadata' ->> 'contact_id')::uuid)
  );

-- DELETE
DROP POLICY IF EXISTS "Portal users can delete their own draft tasks" ON punchlist_tasks;
CREATE POLICY "Portal users can delete their own draft tasks"
  ON punchlist_tasks
  FOR DELETE
  TO authenticated
  USING (
    ((auth.jwt() -> 'app_metadata' ->> 'is_portal_user')::boolean = true)
    AND contact_id = ((auth.jwt() -> 'app_metadata' ->> 'contact_id')::uuid)
    AND status = 'draft'
  );

-- ============================================================
-- punchlist_task_photos
-- ============================================================

-- SELECT
DROP POLICY IF EXISTS "Portal users can view photos for their tasks" ON punchlist_task_photos;
CREATE POLICY "Portal users can view photos for their tasks"
  ON punchlist_task_photos
  FOR SELECT
  TO authenticated
  USING (
    ((auth.jwt() -> 'app_metadata' ->> 'is_portal_user')::boolean = true)
    AND EXISTS (
      SELECT 1 FROM punchlist_tasks pt
      WHERE pt.id = punchlist_task_photos.task_id
        AND pt.contact_id = ((auth.jwt() -> 'app_metadata' ->> 'contact_id')::uuid)
    )
  );

-- INSERT
DROP POLICY IF EXISTS "Portal users can insert photos for their tasks" ON punchlist_task_photos;
CREATE POLICY "Portal users can insert photos for their tasks"
  ON punchlist_task_photos
  FOR INSERT
  TO authenticated
  WITH CHECK (
    ((auth.jwt() -> 'app_metadata' ->> 'is_portal_user')::boolean = true)
    AND organization_id = ((auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid)
    AND EXISTS (
      SELECT 1 FROM punchlist_tasks pt
      WHERE pt.id = punchlist_task_photos.task_id
        AND pt.contact_id = ((auth.jwt() -> 'app_metadata' ->> 'contact_id')::uuid)
    )
  );
