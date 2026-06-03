/*
  # Make contracts company-wide and shared
  
  1. Changes
    - Update contracts table to make company_id nullable
    - Migrate existing contracts to be company-wide (set company_id to NULL)
    - Update RLS policies to allow all authenticated users to access all contracts
    
  2. Security
    - All authenticated users can view all contracts
    - Only admins/owners can create/edit/delete contracts
*/

-- Make company_id nullable since contracts are now company-wide
ALTER TABLE contracts ALTER COLUMN company_id DROP NOT NULL;

-- Migrate existing contracts to be company-wide
UPDATE contracts SET company_id = NULL;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their own contracts" ON contracts;
DROP POLICY IF EXISTS "Authorized users can insert contracts" ON contracts;
DROP POLICY IF EXISTS "Authorized users can update contracts" ON contracts;
DROP POLICY IF EXISTS "Authorized users can delete contracts" ON contracts;

-- Create new company-wide policies
CREATE POLICY "All authenticated users can view contracts"
  ON contracts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert contracts"
  ON contracts FOR INSERT
  TO authenticated
  WITH CHECK (
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
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('owner', 'admin')
    )
  );
