/*
  # Fix Profiles Update Policy for Admin Role Assignment

  ## Changes
    - Add policy allowing admins to update any user's profile
    - This enables role assignment and permission management in the admin interface

  ## Security
    - Only users with 'admin' role can update other users' profiles
    - Regular users can still only update their own profiles
*/

-- Drop the existing restrictive update policy
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

-- Allow users to update their own profile
CREATE POLICY "Users can update own profile"
  ON profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid());

-- Allow admins to update any profile
CREATE POLICY "Admins can update any profile"
  ON profiles
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );
