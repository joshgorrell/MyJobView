/*
  # Fix Proposals RLS Policies
  
  1. Issue
    - Proposals table policies still using auth.uid() directly
    - Need to use auth_uid() stable function for better performance
    - Ensure all sales and admin roles can create proposals
  
  2. Changes
    - Update all policies to use auth_uid() instead of auth.uid()
    - Maintain same security logic
    - Add office_manager to roles that can manage proposals
  
  3. Roles Allowed
    - admin, owner, sales, sales_manager, office_manager can create/update/delete
    - Portal users can view their own proposals
    - Service/production staff can view proposals
*/

-- ============================================================================
-- PROPOSALS INSERT POLICY
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
      AND profiles.role IN ('sales', 'sales_manager', 'admin', 'owner', 'office_manager')
    )
  );

-- ============================================================================
-- PROPOSALS SELECT POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Sales can view all proposals" ON proposals;
CREATE POLICY "Sales can view all proposals"
  ON proposals FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth_uid()
      AND profiles.role IN ('sales', 'sales_manager', 'admin', 'owner', 'office_manager')
    )
  );

DROP POLICY IF EXISTS "Portal users can view their proposals" ON proposals;
CREATE POLICY "Portal users can view their proposals"
  ON proposals FOR SELECT
  TO authenticated
  USING (
    contact_id IN (
      SELECT contacts.id
      FROM contacts
      WHERE contacts.portal_user_id = auth_uid()
    )
  );

DROP POLICY IF EXISTS "Service and production can view proposals" ON proposals;
CREATE POLICY "Service and production can view proposals"
  ON proposals FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth_uid()
      AND profiles.role IN ('service_manager', 'dispatcher', 'production_manager', 'technician', 'lead_technician', 'office_manager')
    )
  );

-- ============================================================================
-- PROPOSALS UPDATE POLICY
-- ============================================================================

DROP POLICY IF EXISTS "Sales can update proposals" ON proposals;
CREATE POLICY "Sales can update proposals"
  ON proposals FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth_uid()
      AND profiles.role IN ('sales', 'sales_manager', 'admin', 'owner', 'office_manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth_uid()
      AND profiles.role IN ('sales', 'sales_manager', 'admin', 'owner', 'office_manager')
    )
  );

-- ============================================================================
-- PROPOSALS DELETE POLICY
-- ============================================================================

DROP POLICY IF EXISTS "Sales can delete proposals" ON proposals;
CREATE POLICY "Sales can delete proposals"
  ON proposals FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth_uid()
      AND profiles.role IN ('sales', 'sales_manager', 'admin', 'owner', 'office_manager')
    )
  );
