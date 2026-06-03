/*
  # Fix Profiles Update Policy - Add WITH CHECK Clause

  ## Problem
    - The "Admins can update any profile" policy only has a USING clause but no WITH CHECK clause
    - When a policy has only USING, PostgreSQL uses it for both pre-check (can I see this row?)
      and post-check (is the updated row still valid?)
    - This causes updates to fail when admins try to update other users' profiles
    - The updated row doesn't pass the check because it's checking the wrong profile

  ## Solution
    - Add an explicit WITH CHECK clause that's always true
    - If the admin passed the USING clause (is_admin_bypass_rls()), they're trusted to
      update to any values
    - The WITH CHECK (true) means "any resulting row values are acceptable"

  ## Security
    - Security is maintained by the USING clause which validates the current user is an admin
    - Once confirmed as admin, they can update any profile to any valid values
*/

-- Drop the existing admin update policy
DROP POLICY IF EXISTS "Admins can update any profile" ON profiles;

-- Recreate with explicit WITH CHECK clause
CREATE POLICY "Admins can update any profile"
  ON profiles
  FOR UPDATE
  TO authenticated
  USING (is_admin_bypass_rls())
  WITH CHECK (true);

COMMENT ON POLICY "Admins can update any profile" ON profiles IS
  'Allows admins to update any user profile. USING checks admin status, WITH CHECK (true) allows any resulting values.';
