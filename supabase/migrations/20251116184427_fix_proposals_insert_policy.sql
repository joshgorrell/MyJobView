/*
  # Fix Proposals INSERT Policy

  ## Summary
  Fixes the INSERT policy on proposals table to allow authenticated users to create proposals.

  ## Changes
  - Drops existing INSERT policy
  - Creates new INSERT policy that properly checks authentication
  - Uses simpler auth check that works with triggers

  ## Notes
  - Policy allows any authenticated user to insert proposals
  - Triggers will handle setting office_id and created_by automatically
*/

-- Drop existing INSERT policy
DROP POLICY IF EXISTS "Users can insert company proposals" ON proposals;

-- Create new INSERT policy with proper authentication check
CREATE POLICY "Users can insert company proposals"
  ON proposals FOR INSERT
  TO authenticated
  WITH CHECK (true);
