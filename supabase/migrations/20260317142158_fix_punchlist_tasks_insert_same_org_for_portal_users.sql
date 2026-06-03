/*
  # Fix punchlist_tasks_insert_same_org Policy for Portal Users

  ## Problem
  The "punchlist_tasks_insert_same_org" policy requires:
    organization_id = get_user_org_id()

  get_user_org_id() reads from profiles, but portal users have no profile row,
  so it returns NULL. NULL = NULL is false in SQL, blocking all portal inserts
  even after the portal-specific policy was fixed.

  ## Fix
  Replace the policy so it also allows portal users whose organization_id
  matches the org from their linked contact (via auth metadata).
  Internal users continue to use get_user_org_id() as before.
*/

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
