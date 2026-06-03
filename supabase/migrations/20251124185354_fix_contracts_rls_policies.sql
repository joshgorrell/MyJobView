/*
  # Fix contracts table RLS policies
  
  1. Changes
    - Drop old RLS policies that reference non-existent company_id in profiles
    - Create new simplified RLS policies based on user ID
    
  2. Security
    - Users can view their own contracts
    - Admins and owners can manage contracts
*/

-- Drop old policies
DROP POLICY IF EXISTS "Users can view contracts from their company" ON contracts;
DROP POLICY IF EXISTS "Admins can insert contracts" ON contracts;
DROP POLICY IF EXISTS "Admins can update contracts" ON contracts;
DROP POLICY IF EXISTS "Admins can delete contracts" ON contracts;

-- Create new policies based on user ID
CREATE POLICY "Users can view their own contracts"
  ON contracts FOR SELECT
  TO authenticated
  USING (company_id = auth.uid());

CREATE POLICY "Admins can insert contracts"
  ON contracts FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Admins can update contracts"
  ON contracts FOR UPDATE
  TO authenticated
  USING (
    company_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Admins can delete contracts"
  ON contracts FOR DELETE
  TO authenticated
  USING (
    company_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('owner', 'admin')
    )
  );
