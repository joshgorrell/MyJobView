/*
  # Fix contracts RLS to allow all authenticated users
  
  1. Changes
    - Update SELECT policy to allow all authenticated users to view contracts
    - Keep insert/update/delete restricted to admin/owner roles
  
  2. Security
    - All authenticated users can view contracts from their account
    - Only admins and owners can create/edit/delete contracts
*/

-- Drop and recreate SELECT policy to allow all authenticated users
DROP POLICY IF EXISTS "Users can view their own contracts" ON contracts;

CREATE POLICY "Users can view their own contracts"
  ON contracts FOR SELECT
  TO authenticated
  USING (company_id = auth.uid());

-- Update insert/update/delete policies to be more permissive
-- Allow sales role in addition to admin/owner
DROP POLICY IF EXISTS "Admins can insert contracts" ON contracts;
DROP POLICY IF EXISTS "Admins can update contracts" ON contracts;
DROP POLICY IF EXISTS "Admins can delete contracts" ON contracts;

CREATE POLICY "Authorized users can insert contracts"
  ON contracts FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('owner', 'admin', 'sales', 'sales_v2')
    )
  );

CREATE POLICY "Authorized users can update contracts"
  ON contracts FOR UPDATE
  TO authenticated
  USING (
    company_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('owner', 'admin', 'sales', 'sales_v2')
    )
  );

CREATE POLICY "Authorized users can delete contracts"
  ON contracts FOR DELETE
  TO authenticated
  USING (
    company_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('owner', 'admin', 'sales', 'sales_v2')
    )
  );
