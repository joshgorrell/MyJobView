/*
  # Fix Proposals UPDATE and DELETE Policies

  1. Changes
    - Simplify UPDATE and DELETE policies with direct role lookup
    - Remove non-existent 'manager' role
    - Consistent with INSERT and SELECT policies
  
  2. Security
    - Only sales and admin can update/delete proposals
*/

-- Drop existing UPDATE and DELETE policies
DROP POLICY IF EXISTS "Sales can update proposals" ON proposals;
DROP POLICY IF EXISTS "Sales can delete proposals" ON proposals;

-- UPDATE policy
CREATE POLICY "Sales can update proposals"
  ON proposals
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('sales', 'admin')
  )
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('sales', 'admin')
  );

-- DELETE policy
CREATE POLICY "Sales can delete proposals"
  ON proposals
  FOR DELETE
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('sales', 'admin')
  );
