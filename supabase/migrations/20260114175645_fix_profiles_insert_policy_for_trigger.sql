/*
  # Fix profiles INSERT policy for trigger

  This migration adds the missing INSERT policy that allows the handle_new_user trigger
  to create profile records when new auth users are created.

  The trigger runs with SECURITY DEFINER which should bypass RLS, but we're adding
  an explicit policy to ensure INSERT operations work properly.
*/

-- Add INSERT policy for service role (used by triggers)
CREATE POLICY "Service role can insert profiles"
  ON profiles
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Also allow authenticated users to insert their own profile (edge case)
CREATE POLICY "Users can insert own profile on signup"
  ON profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());
