/*
  # Fix punchlist_tasks RLS policies to use user_metadata

  ## Problem
  Portal users have their identity data (is_portal_user, contact_id, organization_id) stored
  in raw_user_meta_data (accessible as auth.jwt() -> 'user_metadata'), but ALL the portal-user
  RLS policies were checking auth.jwt() -> 'app_metadata'. This caused every INSERT, SELECT,
  UPDATE, and DELETE from portal users to fail with an RLS violation.

  ## Changes
  - Drop all portal-user punchlist_tasks policies that incorrectly reference 'app_metadata'
  - Recreate them to reference 'user_metadata' instead
  - The internal-user policies (checking get_user_org_id()) are untouched
*/

-- Helper: safely read a text value from user_metadata in the JWT
-- (same pattern used in other recently-fixed portal policies)

-- DROP and recreate the four portal-user policies

DROP POLICY IF EXISTS "Portal users can insert own punchlist tasks via metadata" ON punchlist_tasks;
DROP POLICY IF EXISTS "punchlist_tasks_insert_same_org" ON punchlist_tasks;
DROP POLICY IF EXISTS "Portal users can view their own punchlist tasks" ON punchlist_tasks;
DROP POLICY IF EXISTS "punchlist_tasks_select_same_org" ON punchlist_tasks;
DROP POLICY IF EXISTS "Portal users can update their own punchlist tasks" ON punchlist_tasks;
DROP POLICY IF EXISTS "punchlist_tasks_update_same_org" ON punchlist_tasks;
DROP POLICY IF EXISTS "Portal users can delete their own draft tasks" ON punchlist_tasks;
DROP POLICY IF EXISTS "punchlist_tasks_delete_same_org" ON punchlist_tasks;

-- SELECT
CREATE POLICY "punchlist_tasks_select_same_org"
  ON punchlist_tasks FOR SELECT
  TO authenticated
  USING (organization_id = get_user_org_id());

CREATE POLICY "Portal users can view their own punchlist tasks"
  ON punchlist_tasks FOR SELECT
  TO authenticated
  USING (
    ((auth.jwt() -> 'user_metadata' ->> 'is_portal_user')::boolean = true)
    AND contact_id = ((auth.jwt() -> 'user_metadata' ->> 'contact_id')::uuid)
  );

-- INSERT
CREATE POLICY "punchlist_tasks_insert_same_org"
  ON punchlist_tasks FOR INSERT
  TO authenticated
  WITH CHECK (
    (organization_id = get_user_org_id())
    OR (
      ((auth.jwt() -> 'user_metadata' ->> 'is_portal_user')::boolean = true)
      AND organization_id = ((auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
    )
  );

CREATE POLICY "Portal users can insert own punchlist tasks via metadata"
  ON punchlist_tasks FOR INSERT
  TO authenticated
  WITH CHECK (
    ((auth.jwt() -> 'user_metadata' ->> 'is_portal_user')::boolean = true)
    AND contact_id = ((auth.jwt() -> 'user_metadata' ->> 'contact_id')::uuid)
    AND organization_id = ((auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
  );

-- UPDATE
CREATE POLICY "punchlist_tasks_update_same_org"
  ON punchlist_tasks FOR UPDATE
  TO authenticated
  USING (organization_id = get_user_org_id())
  WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY "Portal users can update their own punchlist tasks"
  ON punchlist_tasks FOR UPDATE
  TO authenticated
  USING (
    ((auth.jwt() -> 'user_metadata' ->> 'is_portal_user')::boolean = true)
    AND contact_id = ((auth.jwt() -> 'user_metadata' ->> 'contact_id')::uuid)
  )
  WITH CHECK (
    ((auth.jwt() -> 'user_metadata' ->> 'is_portal_user')::boolean = true)
    AND contact_id = ((auth.jwt() -> 'user_metadata' ->> 'contact_id')::uuid)
  );

-- DELETE
CREATE POLICY "punchlist_tasks_delete_same_org"
  ON punchlist_tasks FOR DELETE
  TO authenticated
  USING (organization_id = get_user_org_id());

CREATE POLICY "Portal users can delete their own draft tasks"
  ON punchlist_tasks FOR DELETE
  TO authenticated
  USING (
    ((auth.jwt() -> 'user_metadata' ->> 'is_portal_user')::boolean = true)
    AND contact_id = ((auth.jwt() -> 'user_metadata' ->> 'contact_id')::uuid)
    AND status = 'draft'
  );
