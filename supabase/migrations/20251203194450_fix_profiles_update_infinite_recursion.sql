/*
  # Fix Profiles Update Policy Infinite Recursion

  ## Problem
    - The admin update policy causes infinite recursion by querying the profiles table within its own policy
    - When updating a profile, the policy checks is_admin() which queries profiles, triggering the policy again

  ## Solution
    - Create a security definer function that bypasses RLS to safely check admin status
    - Update the admin policy to use this function instead of querying profiles directly

  ## Security
    - The function is marked as SECURITY DEFINER to bypass RLS when checking admin status
    - It only returns a boolean, so it doesn't expose any sensitive data
    - Regular users can still only update their own profiles
*/

-- Create a security definer function to check admin status without RLS
CREATE OR REPLACE FUNCTION is_admin_bypass_rls()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role = 'admin'
  );
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION is_admin_bypass_rls() TO authenticated;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can update any profile" ON profiles;

-- Recreate user update policy
CREATE POLICY "Users can update own profile"
  ON profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid());

-- Recreate admin update policy using security definer function
CREATE POLICY "Admins can update any profile"
  ON profiles
  FOR UPDATE
  TO authenticated
  USING (is_admin_bypass_rls());

COMMENT ON FUNCTION is_admin_bypass_rls() IS 'Security definer function to check admin status bypassing RLS - prevents infinite recursion in profiles policies';
