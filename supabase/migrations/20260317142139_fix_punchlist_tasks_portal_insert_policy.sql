/*
  # Fix Punchlist Tasks INSERT Policy for Portal Users

  ## Problem
  Portal users (customers) cannot create punchlist tasks because:

  1. The existing INSERT policy "Portal users can create their own punchlist tasks"
     checks profiles.role = 'portal_user', but portal users intentionally have NO
     profile row — the profiles table only covers internal staff.

  2. The "punchlist_tasks_insert_same_org" policy calls get_user_org_id() which
     reads from profiles — returns NULL for portal users, failing that check too.

  Both policies must pass for an INSERT to succeed, but neither can pass for a
  portal user without a profile.

  ## Fix
  Replace the broken portal INSERT policy with one that reads contact_id directly
  from auth.users metadata (set when portal accounts are created). Also add an
  org check that resolves via the contact record rather than the profiles table.

  ## Security
  - Portal users can only insert tasks where contact_id matches their own contact
  - organization_id is validated against the contact's org, preventing spoofing
*/

-- Drop the broken portal INSERT policy
DROP POLICY IF EXISTS "Portal users can create their own punchlist tasks" ON punchlist_tasks;

-- Create a replacement that works without a profiles row.
-- Reads contact_id from auth.users metadata (set at portal account creation),
-- then validates org matches the contact's actual organization.
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
