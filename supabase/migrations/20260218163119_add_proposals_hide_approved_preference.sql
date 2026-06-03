/*
  # Add proposals_hide_approved preference to profiles

  ## Summary
  Adds a new boolean column `proposals_hide_approved` to the `profiles` table.
  This allows users to hide approved proposals from the proposals list view,
  since approved proposals have been converted to sales orders and are typically
  no longer needed in the proposals workflow.

  ## Changes
  - `profiles` table: adds `proposals_hide_approved` boolean column, defaults to TRUE
    so that approved proposals are hidden by default for all users (existing and new).
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'proposals_hide_approved'
  ) THEN
    ALTER TABLE profiles ADD COLUMN proposals_hide_approved boolean DEFAULT true;
  END IF;
END $$;

UPDATE profiles SET proposals_hide_approved = true WHERE proposals_hide_approved IS NULL;
