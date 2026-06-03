/*
  # Add Profiles DELETE Policy

  ## Summary
  Adds DELETE policy on profiles table to allow admins and service role to delete user profiles.
  This is required for the delete-user edge function to work properly.

  ## Changes
  - Add DELETE policy for service role (used by edge function)
  - Add DELETE policy for admin users
*/

-- Add DELETE policy for service role (used by edge function with service role key)
DROP POLICY IF EXISTS "Service role can delete profiles" ON profiles;
CREATE POLICY "Service role can delete profiles" 
  ON profiles FOR DELETE
  TO service_role
  USING (true);

-- Add DELETE policy for admin users
DROP POLICY IF EXISTS "Admins can delete profiles" ON profiles;
CREATE POLICY "Admins can delete profiles" 
  ON profiles FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles AS admin_profile
      WHERE admin_profile.id = auth.uid()
      AND admin_profile.role = 'admin'
    )
  );
