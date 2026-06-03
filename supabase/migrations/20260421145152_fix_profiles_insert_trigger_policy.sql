/*
  # Fix profiles_insert_trigger Always-True RLS Policy

  The INSERT policy "profiles_insert_trigger" has WITH CHECK = true, which allows
  any authenticated user to insert any profile row — bypassing RLS entirely.

  The only legitimate inserter is the handle_new_user() trigger function, which
  runs as SECURITY DEFINER and therefore bypasses RLS automatically. The policy
  only needs to cover the edge case where a user creates their own profile row
  (id must match their auth.uid()).

  Fix: Restrict WITH CHECK to only allow inserting a row where id = auth.uid(),
  which is the only valid self-insert scenario.
*/

DROP POLICY IF EXISTS "profiles_insert_trigger" ON profiles;

CREATE POLICY "profiles_insert_trigger"
  ON profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());
