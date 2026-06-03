/*
  # Fix Proposal Related Tables RLS Policies

  1. Changes
    - Update proposal_rooms and proposal_line_items policies
    - Use consistent auth.uid() instead of auth_uid()
    - Simplify with direct role checks
  
  2. Security
    - Sales and admin can manage all rooms and line items
    - Portal users can view their own
*/

-- ============================================
-- PROPOSAL_ROOMS POLICIES
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view proposal rooms" ON proposal_rooms;
DROP POLICY IF EXISTS "Portal users can view rooms in their proposals" ON proposal_rooms;
DROP POLICY IF EXISTS "Users can insert proposal rooms" ON proposal_rooms;
DROP POLICY IF EXISTS "Users can update proposal rooms" ON proposal_rooms;
DROP POLICY IF EXISTS "Users can delete proposal rooms" ON proposal_rooms;

-- SELECT policies
CREATE POLICY "Users can view proposal rooms"
  ON proposal_rooms
  FOR SELECT
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('sales', 'admin', 'finance', 'tech')
  );

CREATE POLICY "Portal users can view rooms in their proposals"
  ON proposal_rooms
  FOR SELECT
  TO authenticated
  USING (
    proposal_id IN (
      SELECT p.id FROM proposals p
      JOIN contacts c ON c.id = p.contact_id
      WHERE c.portal_user_id = auth.uid()
    )
  );

-- INSERT policy
CREATE POLICY "Users can insert proposal rooms"
  ON proposal_rooms
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('sales', 'admin')
  );

-- UPDATE policy
CREATE POLICY "Users can update proposal rooms"
  ON proposal_rooms
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('sales', 'admin')
  )
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('sales', 'admin')
  );

-- DELETE policy
CREATE POLICY "Users can delete proposal rooms"
  ON proposal_rooms
  FOR DELETE
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('sales', 'admin')
  );

-- ============================================
-- PROPOSAL_LINE_ITEMS POLICIES
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view proposal line items" ON proposal_line_items;
DROP POLICY IF EXISTS "Portal users can view line items in their proposals" ON proposal_line_items;
DROP POLICY IF EXISTS "Users can insert proposal line items" ON proposal_line_items;
DROP POLICY IF EXISTS "Users can update proposal line items" ON proposal_line_items;
DROP POLICY IF EXISTS "Users can delete proposal line items" ON proposal_line_items;

-- SELECT policies
CREATE POLICY "Users can view proposal line items"
  ON proposal_line_items
  FOR SELECT
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('sales', 'admin', 'finance', 'tech')
  );

CREATE POLICY "Portal users can view line items in their proposals"
  ON proposal_line_items
  FOR SELECT
  TO authenticated
  USING (
    proposal_id IN (
      SELECT p.id FROM proposals p
      JOIN contacts c ON c.id = p.contact_id
      WHERE c.portal_user_id = auth.uid()
    )
  );

-- INSERT policy
CREATE POLICY "Users can insert proposal line items"
  ON proposal_line_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('sales', 'admin')
  );

-- UPDATE policy
CREATE POLICY "Users can update proposal line items"
  ON proposal_line_items
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('sales', 'admin')
  )
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('sales', 'admin')
  );

-- DELETE policy
CREATE POLICY "Users can delete proposal line items"
  ON proposal_line_items
  FOR DELETE
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('sales', 'admin')
  );
