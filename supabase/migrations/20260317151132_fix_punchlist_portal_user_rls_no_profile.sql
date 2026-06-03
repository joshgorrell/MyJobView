/*
  # Fix punchlist RLS policies for portal users who have no profile row

  ## Problem
  Portal users (like John Candy) have no row in the profiles table.
  The existing portal SELECT/UPDATE/DELETE policies all query profiles:
    - "Portal users can view their own punchlist tasks" → checks profiles.contact_id
    - "Portal users can update their own punchlist tasks" → checks profiles.contact_id
    - "Portal users can delete their own draft tasks" → checks profiles.id

  Since portal users have no profile row, these policies never match,
  meaning portal users cannot view, update, or delete their own tasks.

  The INSERT policy "Portal users can insert own punchlist tasks via metadata"
  correctly uses auth.users metadata instead of profiles — but the
  "punchlist_tasks_insert_same_org" policy also runs and requires
  organization_id = get_user_org_id(), which returns NULL for portal users
  (no profile). Both INSERT policies must pass for an insert to succeed,
  but the org policy blocks it.

  ## Fix
  1. Drop the four broken portal-specific policies
  2. Replace with metadata-based policies that read from auth.users directly
  3. Update punchlist_tasks_insert_same_org to allow portal users whose
     contact's org matches (already exists but re-confirm it's correct)
  4. Add org-based exceptions to the SELECT/UPDATE/DELETE org policies
*/

-- Drop old profile-based portal policies
DROP POLICY IF EXISTS "Portal users can view their own punchlist tasks" ON punchlist_tasks;
DROP POLICY IF EXISTS "Portal users can update their own punchlist tasks" ON punchlist_tasks;
DROP POLICY IF EXISTS "Portal users can delete their own draft tasks" ON punchlist_tasks;
DROP POLICY IF EXISTS "Portal users can insert own punchlist tasks via metadata" ON punchlist_tasks;

-- SELECT: portal users can view tasks where their contact_id matches
CREATE POLICY "Portal users can view their own punchlist tasks"
  ON punchlist_tasks
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM auth.users au
      WHERE au.id = auth.uid()
        AND (au.raw_user_meta_data->>'is_portal_user')::boolean = true
        AND (au.raw_user_meta_data->>'contact_id')::uuid = punchlist_tasks.contact_id
    )
  );

-- INSERT: portal users can insert tasks for their own contact in the correct org
CREATE POLICY "Portal users can insert own punchlist tasks via metadata"
  ON punchlist_tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM auth.users au
      JOIN contacts c ON c.id = (au.raw_user_meta_data->>'contact_id')::uuid
      WHERE au.id = auth.uid()
        AND (au.raw_user_meta_data->>'is_portal_user')::boolean = true
        AND c.id = punchlist_tasks.contact_id
        AND c.organization_id = punchlist_tasks.organization_id
    )
  );

-- UPDATE: portal users can update their own tasks
CREATE POLICY "Portal users can update their own punchlist tasks"
  ON punchlist_tasks
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM auth.users au
      WHERE au.id = auth.uid()
        AND (au.raw_user_meta_data->>'is_portal_user')::boolean = true
        AND (au.raw_user_meta_data->>'contact_id')::uuid = punchlist_tasks.contact_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM auth.users au
      WHERE au.id = auth.uid()
        AND (au.raw_user_meta_data->>'is_portal_user')::boolean = true
        AND (au.raw_user_meta_data->>'contact_id')::uuid = punchlist_tasks.contact_id
    )
  );

-- DELETE: portal users can delete their own draft tasks
CREATE POLICY "Portal users can delete their own draft tasks"
  ON punchlist_tasks
  FOR DELETE
  TO authenticated
  USING (
    status = 'draft'
    AND EXISTS (
      SELECT 1
      FROM auth.users au
      WHERE au.id = auth.uid()
        AND (au.raw_user_meta_data->>'is_portal_user')::boolean = true
        AND (au.raw_user_meta_data->>'contact_id')::uuid = punchlist_tasks.contact_id
    )
  );

-- Ensure punchlist_tasks_insert_same_org allows portal users via contact org lookup
DROP POLICY IF EXISTS "punchlist_tasks_insert_same_org" ON punchlist_tasks;

CREATE POLICY "punchlist_tasks_insert_same_org"
  ON punchlist_tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id = get_user_org_id()
    OR
    EXISTS (
      SELECT 1
      FROM auth.users au
      JOIN contacts c ON c.id = (au.raw_user_meta_data->>'contact_id')::uuid
      WHERE au.id = auth.uid()
        AND (au.raw_user_meta_data->>'is_portal_user')::boolean = true
        AND c.organization_id = punchlist_tasks.organization_id
    )
  );
