/*
  # Fix Remaining Unoptimized RLS Policies
  
  1. Issue
    - serial_lot_tracking still uses auth.uid() instead of auth_uid()
    - This can cause permission issues when creating proposals
  
  2. Tables Fixed
    - serial_lot_tracking
    - Also optimize proposal_line_items and proposal_rooms while we're at it
  
  3. Changes
    - Replace auth.uid() with auth_uid() for performance and consistency
    - Maintain same security logic
*/

-- ============================================================================
-- SERIAL_LOT_TRACKING POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Authorized users can manage serial tracking" ON serial_lot_tracking;
CREATE POLICY "Authorized users can manage serial tracking"
  ON serial_lot_tracking FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth_uid()
      AND profiles.role IN ('admin', 'production_manager', 'warehouse_manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth_uid()
      AND profiles.role IN ('admin', 'production_manager', 'warehouse_manager')
    )
  );

DROP POLICY IF EXISTS "Users can view serial tracking" ON serial_lot_tracking;
CREATE POLICY "Users can view serial tracking"
  ON serial_lot_tracking FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth_uid()
      AND profiles.role IN ('admin', 'production_manager', 'warehouse_manager', 'technician', 'dispatcher')
    )
  );

-- ============================================================================
-- PROPOSAL_LINE_ITEMS POLICIES - Optimize and make more restrictive
-- ============================================================================

DROP POLICY IF EXISTS "Users can insert proposal line items" ON proposal_line_items;
CREATE POLICY "Users can insert proposal line items"
  ON proposal_line_items FOR INSERT
  TO authenticated
  WITH CHECK (auth_uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can update proposal line items" ON proposal_line_items;
CREATE POLICY "Users can update proposal line items"
  ON proposal_line_items FOR UPDATE
  TO authenticated
  USING (auth_uid() IS NOT NULL)
  WITH CHECK (auth_uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can delete proposal line items" ON proposal_line_items;
CREATE POLICY "Users can delete proposal line items"
  ON proposal_line_items FOR DELETE
  TO authenticated
  USING (auth_uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can view proposal line items" ON proposal_line_items;
CREATE POLICY "Users can view proposal line items"
  ON proposal_line_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth_uid()
      AND profiles.role IN ('admin', 'sales', 'sales_manager', 'office_manager', 'dispatcher', 'production_manager', 'technician')
    )
  );

DROP POLICY IF EXISTS "Portal users can view line items in their proposals" ON proposal_line_items;
CREATE POLICY "Portal users can view line items in their proposals"
  ON proposal_line_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM proposals
      JOIN contacts ON contacts.id = proposals.contact_id
      WHERE proposals.id = proposal_line_items.proposal_id
      AND contacts.portal_user_id = auth_uid()
    )
  );

-- ============================================================================
-- PROPOSAL_ROOMS POLICIES - Optimize
-- ============================================================================

DROP POLICY IF EXISTS "Users can insert proposal rooms" ON proposal_rooms;
CREATE POLICY "Users can insert proposal rooms"
  ON proposal_rooms FOR INSERT
  TO authenticated
  WITH CHECK (auth_uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can update proposal rooms" ON proposal_rooms;
CREATE POLICY "Users can update proposal rooms"
  ON proposal_rooms FOR UPDATE
  TO authenticated
  USING (auth_uid() IS NOT NULL)
  WITH CHECK (auth_uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can delete proposal rooms" ON proposal_rooms;
CREATE POLICY "Users can delete proposal rooms"
  ON proposal_rooms FOR DELETE
  TO authenticated
  USING (auth_uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can view proposal rooms" ON proposal_rooms;
CREATE POLICY "Users can view proposal rooms"
  ON proposal_rooms FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth_uid()
      AND profiles.role IN ('admin', 'sales', 'sales_manager', 'office_manager', 'dispatcher', 'production_manager', 'technician')
    )
  );

DROP POLICY IF EXISTS "Portal users can view rooms in their proposals" ON proposal_rooms;
CREATE POLICY "Portal users can view rooms in their proposals"
  ON proposal_rooms FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM proposals
      JOIN contacts ON contacts.id = proposals.contact_id
      WHERE proposals.id = proposal_rooms.proposal_id
      AND contacts.portal_user_id = auth_uid()
    )
  );
