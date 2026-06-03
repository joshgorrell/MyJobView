/*
  # Fix punchlist_tasks portal RLS policies to use auth.jwt() instead of auth.users

  ## Problem
  The portal user INSERT and SELECT policies were doing `JOIN auth.users`
  which the `authenticated` role cannot access directly, causing
  "Permission denied for table users" errors.

  ## Fix
  Replace `auth.users` joins with `auth.jwt()` calls which ARE accessible
  to authenticated users. Portal user metadata is stored in the JWT.

  ## Changes
  - DROP and recreate "Portal users can insert own punchlist tasks via metadata"
  - DROP and recreate "punchlist_tasks_insert_same_org" (portal branch)
  - DROP and recreate "Portal users can view their own punchlist tasks"
*/

-- Fix INSERT policy: use auth.jwt() instead of auth.users join
DROP POLICY IF EXISTS "Portal users can insert own punchlist tasks via metadata" ON punchlist_tasks;

CREATE POLICY "Portal users can insert own punchlist tasks via metadata"
  ON punchlist_tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt()->>'is_portal_user')::boolean = true
    AND contact_id = (auth.jwt()->>'contact_id')::uuid
    AND organization_id = (auth.jwt()->>'organization_id')::uuid
  );

-- Fix the org-level INSERT policy to also use jwt() for portal users
DROP POLICY IF EXISTS "punchlist_tasks_insert_same_org" ON punchlist_tasks;

CREATE POLICY "punchlist_tasks_insert_same_org"
  ON punchlist_tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id = get_user_org_id()
    OR (
      (auth.jwt()->>'is_portal_user')::boolean = true
      AND organization_id = (auth.jwt()->>'organization_id')::uuid
    )
  );

-- Fix SELECT policy: use auth.jwt() instead of auth.users join
DROP POLICY IF EXISTS "Portal users can view their own punchlist tasks" ON punchlist_tasks;

CREATE POLICY "Portal users can view their own punchlist tasks"
  ON punchlist_tasks
  FOR SELECT
  TO authenticated
  USING (
    (auth.jwt()->>'is_portal_user')::boolean = true
    AND contact_id = (auth.jwt()->>'contact_id')::uuid
  );

-- Fix UPDATE policy too if it has the same issue
DROP POLICY IF EXISTS "Portal users can update their own punchlist tasks" ON punchlist_tasks;

CREATE POLICY "Portal users can update their own punchlist tasks"
  ON punchlist_tasks
  FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt()->>'is_portal_user')::boolean = true
    AND contact_id = (auth.jwt()->>'contact_id')::uuid
  )
  WITH CHECK (
    (auth.jwt()->>'is_portal_user')::boolean = true
    AND contact_id = (auth.jwt()->>'contact_id')::uuid
  );

-- Fix DELETE policy too
DROP POLICY IF EXISTS "Portal users can delete their own draft tasks" ON punchlist_tasks;

CREATE POLICY "Portal users can delete their own draft tasks"
  ON punchlist_tasks
  FOR DELETE
  TO authenticated
  USING (
    (auth.jwt()->>'is_portal_user')::boolean = true
    AND contact_id = (auth.jwt()->>'contact_id')::uuid
    AND status = 'draft'
  );
