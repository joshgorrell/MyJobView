/*
  # Fix Profile RLS Policy - Correct Implementation
  
  ## Changes
  - Fix "Users can view other active profiles" policy to actually check is_active
  - Keep "Users can view own profile" as is
  
  ## Security
  - Users can always see their own profile (regardless of active status)
  - Users can only see OTHER profiles if those profiles are active
*/

-- Drop the incorrect policy
DROP POLICY IF EXISTS "Users can view other active profiles" ON public.profiles;

-- Create correct policy that checks is_active for OTHER profiles
CREATE POLICY "Users can view other active profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (id != (select auth.uid()) AND is_active = true);
