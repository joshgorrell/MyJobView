/*
  # Optimize RLS Policies - Batch 3: Company Settings, Departments, Crew
  
  1. Tables Optimized
    - company_settings (2 policies)
    - company_offices (3 policies)
    - change_orders (2 policies)
    - crew_assignments (2 policies) - uses lead_technician_id and helper_technician_ids
    - control4_projects (1 policy)
    - default_starred_modules (1 policy)
    - department_access (3 policies)
    - departments (2 policies)
  
  2. Changes Made
    - Replace auth.uid() with auth_uid() stable function
    - Replace inline admin checks with is_admin() function
    - Replace inline manager checks with is_manager() function
  
  3. Performance Impact
    - Policies evaluated once per query instead of per row
*/

-- ============================================================================
-- COMPANY SETTINGS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Only admins can insert company settings" ON company_settings;
CREATE POLICY "Only admins can insert company settings"
  ON company_settings FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Only admins can update company settings" ON company_settings;
CREATE POLICY "Only admins can update company settings"
  ON company_settings FOR UPDATE
  TO authenticated
  USING (is_admin());

-- ============================================================================
-- COMPANY OFFICES POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Only admins can delete company offices" ON company_offices;
CREATE POLICY "Only admins can delete company offices"
  ON company_offices FOR DELETE
  TO authenticated
  USING (is_admin());

DROP POLICY IF EXISTS "Only admins can update company offices" ON company_offices;
CREATE POLICY "Only admins can update company offices"
  ON company_offices FOR UPDATE
  TO authenticated
  USING (is_admin());

DROP POLICY IF EXISTS "Only admins can insert company offices" ON company_offices;
CREATE POLICY "Only admins can insert company offices"
  ON company_offices FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

-- ============================================================================
-- CHANGE ORDERS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view change orders" ON change_orders;
CREATE POLICY "Users can view change orders"
  ON change_orders FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth_uid()
      AND profiles.role IN ('admin', 'office_manager', 'project_manager', 'sales')
    )
  );

DROP POLICY IF EXISTS "Managers can manage change orders" ON change_orders;
CREATE POLICY "Managers can manage change orders"
  ON change_orders FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth_uid()
      AND profiles.role IN ('admin', 'office_manager', 'project_manager')
    )
  );

-- ============================================================================
-- CREW ASSIGNMENTS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Dispatchers can manage crew assignments" ON crew_assignments;
CREATE POLICY "Dispatchers can manage crew assignments"
  ON crew_assignments FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth_uid()
      AND profiles.role IN ('admin', 'dispatcher', 'office_manager')
    )
  );

DROP POLICY IF EXISTS "Users can view relevant crew assignments" ON crew_assignments;
CREATE POLICY "Users can view relevant crew assignments"
  ON crew_assignments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth_uid()
      AND profiles.role IN ('admin', 'dispatcher', 'office_manager', 'technician')
    )
    OR lead_technician_id = auth_uid()
    OR auth_uid() = ANY(helper_technician_ids)
  );

-- ============================================================================
-- CONTROL4 PROJECTS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can manage control4 projects" ON control4_projects;
CREATE POLICY "Users can manage control4 projects"
  ON control4_projects FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth_uid()
      AND profiles.role IN ('admin', 'office_manager', 'sales')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth_uid()
      AND profiles.role IN ('admin', 'office_manager', 'sales')
    )
  );

-- ============================================================================
-- DEFAULT STARRED MODULES POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Admins can manage default starred modules" ON default_starred_modules;
CREATE POLICY "Admins can manage default starred modules"
  ON default_starred_modules FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ============================================================================
-- DEPARTMENT ACCESS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Admins can manage department access" ON department_access;
CREATE POLICY "Admins can manage department access"
  ON department_access FOR ALL
  TO authenticated
  USING (is_admin());

DROP POLICY IF EXISTS "Admins can view all department access" ON department_access;
CREATE POLICY "Admins can view all department access"
  ON department_access FOR SELECT
  TO authenticated
  USING (is_admin());

DROP POLICY IF EXISTS "Users can view their own department access" ON department_access;
CREATE POLICY "Users can view their own department access"
  ON department_access FOR SELECT
  TO authenticated
  USING (user_id = auth_uid());

-- ============================================================================
-- DEPARTMENTS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Admins can manage departments" ON departments;
CREATE POLICY "Admins can manage departments"
  ON departments FOR ALL
  TO authenticated
  USING (is_admin());

DROP POLICY IF EXISTS "All users can view departments" ON departments;
CREATE POLICY "All users can view departments"
  ON departments FOR SELECT
  TO authenticated
  USING (true);
