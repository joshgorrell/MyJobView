/*
  # Fix Profile SELECT Policy

  1. Changes
    - Drop the restrictive "Users can view active profiles" policy
    - Create new policy that allows users to view their own profile (regardless of active status)
    - Create policy that allows viewing other profiles only if they are active
  
  2. Security
    - Users can always see their own profile
    - Users can only see other profiles if those profiles are active
*/

-- Drop the old policy
DROP POLICY IF EXISTS "Users can view active profiles" ON profiles;

-- Allow users to view their own profile
CREATE POLICY "Users can view own profile"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Allow users to view other active profiles
CREATE POLICY "Users can view other active profiles"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() != id AND is_active = true);
