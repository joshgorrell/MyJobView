/*
  # Fix Proposals SELECT Policies

  1. Changes
    - Drop and recreate SELECT policies with simplified logic
    - Use direct role lookup instead of EXISTS
    - Remove non-existent 'manager' role from checks
  
  2. Security
    - Sales and admin can view all proposals
    - Finance can view all proposals
    - Tech can view all proposals
    - Portal users can view their own proposals
*/

-- Drop existing SELECT policies
DROP POLICY IF EXISTS "Sales can view all proposals" ON proposals;
DROP POLICY IF EXISTS "Techs can view proposals" ON proposals;
DROP POLICY IF EXISTS "Portal users can view their proposals" ON proposals;

-- Sales, admin, and finance can view all proposals
CREATE POLICY "Sales can view all proposals"
  ON proposals
  FOR SELECT
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('sales', 'admin', 'finance')
  );

-- Techs can view all proposals
CREATE POLICY "Techs can view proposals"
  ON proposals
  FOR SELECT
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'tech'
  );

-- Portal users can view their own proposals
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
