/*
  # Add can_delete_invoices permission to profiles

  ## Summary
  Adds a granular permission flag to profiles that controls who can delete paid invoices.

  ## Changes

  ### Modified Tables
  - `profiles`
    - New column: `can_delete_invoices` (boolean, default false)
      - When true, this user can delete paid/partial invoices (in addition to admin role)
      - Admin role always has implicit delete permission regardless of this flag
      - All other roles can still delete draft/void invoices without this flag

  ## Notes
  - Admins always have this permission implicitly
  - Grant to specific non-admin users via the user management / permissions UI
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'can_delete_invoices'
  ) THEN
    ALTER TABLE profiles ADD COLUMN can_delete_invoices boolean DEFAULT false;
  END IF;
END $$;
