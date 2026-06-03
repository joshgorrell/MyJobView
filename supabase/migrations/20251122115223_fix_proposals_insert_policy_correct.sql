/*
  # Fix Proposals Insert Policy

  1. Changes
    - Drop existing insert policy
    - Recreate with proper auth.uid() reference
    - Ensure sales, manager, and admin roles can create proposals
  
  2. Security
    - Maintains proper role-based access control
    - Uses correct Supabase auth functions
*/

-- Drop the existing policy
DROP POLICY IF EXISTS "Sales can create proposals" ON proposals;

-- Recreate with correct auth reference
CREATE POLICY "Sales can create proposals"
  ON proposals
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('sales', 'manager', 'admin')
    )
  );
