/*
  # Simplify Proposals Insert Policy - Direct Role Check

  1. Changes
    - Replace EXISTS subquery with direct profile lookup
    - This should be more efficient and avoid potential issues
  
  2. Security
    - Still maintains role-based access control
    - Only sales and admin roles (actual roles in system) can create
*/

-- Drop existing policy
DROP POLICY IF EXISTS "Sales can create proposals" ON proposals;

-- Create simplified policy with direct check
CREATE POLICY "Sales can create proposals"
  ON proposals
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('sales', 'admin')
  );
