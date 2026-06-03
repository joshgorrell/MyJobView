/*
  # Fix All Proposals RLS Policies to Use Consistent Auth Function

  1. Changes
    - Drop all existing proposals policies
    - Recreate all policies using auth.uid() consistently
    - Ensure all roles can perform appropriate operations
  
  2. Security
    - Sales, manager, admin can create, update, delete
    - Finance can view
    - Tech can view
    - Portal users can view their own
*/

-- Drop all existing policies
DROP POLICY IF EXISTS "Sales can create proposals" ON proposals;
DROP POLICY IF EXISTS "Sales can view all proposals" ON proposals;
DROP POLICY IF EXISTS "Techs can view proposals" ON proposals;
DROP POLICY IF EXISTS "Portal users can view their proposals" ON proposals;
DROP POLICY IF EXISTS "Sales can update proposals" ON proposals;
DROP POLICY IF EXISTS "Sales can delete proposals" ON proposals;

-- Recreate all policies with consistent auth.uid()

-- SELECT policies
CREATE POLICY "Sales can view all proposals"
  ON proposals
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('sales', 'manager', 'admin', 'finance')
    )
  );

CREATE POLICY "Techs can view proposals"
  ON proposals
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'tech'
    )
  );

CREATE POLICY "Portal users can view their proposals"
  ON proposals
  FOR SELECT
  TO authenticated
  USING (
    contact_id IN (
      SELECT contacts.id
      FROM contacts
      WHERE contacts.portal_user_id = auth.uid()
    )
  );

-- INSERT policy
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

-- UPDATE policy
CREATE POLICY "Sales can update proposals"
  ON proposals
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('sales', 'manager', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('sales', 'manager', 'admin')
    )
  );

-- DELETE policy
CREATE POLICY "Sales can delete proposals"
  ON proposals
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('sales', 'manager', 'admin')
    )
  );
