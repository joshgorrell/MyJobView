/*
  # Fix RLS Policies to Use Correct Role Names
  
  1. Issue
    - Policies were using incorrect role names like 'sales_manager', 'office_manager', 'technician'
    - Actual roles in system are: admin, finance, manager, sales, tech
  
  2. Role Mapping
    - admin = admin (no change)
    - manager = replaces office_manager, sales_manager, production_manager, etc.
    - sales = replaces sales (no change)
    - tech = replaces technician, lead_technician
    - finance = handles financial operations
  
  3. Tables Fixed
    - proposals
    - proposal_line_items
    - proposal_rooms
    - serial_lot_tracking
    - control4_projects
    - And any other tables with incorrect role references
*/

-- ============================================================================
-- PROPOSALS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Sales can create proposals" ON proposals;
CREATE POLICY "Sales can create proposals"
  ON proposals FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth_uid()
      AND profiles.role IN ('sales', 'manager', 'admin')
    )
  );

DROP POLICY IF EXISTS "Sales can view all proposals" ON proposals;
CREATE POLICY "Sales can view all proposals"
  ON proposals FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth_uid()
      AND profiles.role IN ('sales', 'manager', 'admin', 'finance')
    )
  );

DROP POLICY IF EXISTS "Service and production can view proposals" ON proposals;
CREATE POLICY "Techs can view proposals"
  ON proposals FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth_uid()
      AND profiles.role = 'tech'
    )
  );

DROP POLICY IF EXISTS "Sales can update proposals" ON proposals;
CREATE POLICY "Sales can update proposals"
  ON proposals FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth_uid()
      AND profiles.role IN ('sales', 'manager', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth_uid()
      AND profiles.role IN ('sales', 'manager', 'admin')
    )
  );

DROP POLICY IF EXISTS "Sales can delete proposals" ON proposals;
CREATE POLICY "Sales can delete proposals"
  ON proposals FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth_uid()
      AND profiles.role IN ('sales', 'manager', 'admin')
    )
  );

-- ============================================================================
-- PROPOSAL_LINE_ITEMS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view proposal line items" ON proposal_line_items;
CREATE POLICY "Users can view proposal line items"
  ON proposal_line_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth_uid()
      AND profiles.role IN ('admin', 'sales', 'manager', 'finance', 'tech')
    )
  );

-- ============================================================================
-- PROPOSAL_ROOMS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view proposal rooms" ON proposal_rooms;
CREATE POLICY "Users can view proposal rooms"
  ON proposal_rooms FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth_uid()
      AND profiles.role IN ('admin', 'sales', 'manager', 'finance', 'tech')
    )
  );

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
      AND profiles.role IN ('admin', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth_uid()
      AND profiles.role IN ('admin', 'manager')
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
      AND profiles.role IN ('admin', 'manager', 'tech')
    )
  );

-- ============================================================================
-- CONTROL4_PROJECTS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can manage control4 projects" ON control4_projects;
CREATE POLICY "Users can manage control4 projects"
  ON control4_projects FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth_uid()
      AND profiles.role IN ('admin', 'manager', 'sales')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth_uid()
      AND profiles.role IN ('admin', 'manager', 'sales')
    )
  );

DROP POLICY IF EXISTS "Users can view control4 projects" ON control4_projects;
CREATE POLICY "Users can view control4 projects"
  ON control4_projects FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth_uid()
      AND profiles.role IN ('admin', 'manager', 'sales', 'tech')
    )
  );
