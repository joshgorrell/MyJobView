/*
  # Optimize RLS Policies - Batch 2: Contacts, Clock Entries, Commissions
  
  1. Tables Optimized
    - contacts (4 policies)
    - contact_captures (1 policy) - uses captured_by column
    - daily_clock_entries (4 policies)
    - daily_clock_breaks (3 policies) - uses daily_clock_entry_id column
    - clock_in_rewards_log (1 policy)
    - commission_records (2 policies)
    - commission_payments (2 policies)
    - commission_adjustments (2 policies)
    - company_commission_settings (1 policy)
  
  2. Changes Made
    - Replace auth.uid() with auth_uid() stable function
    - Replace inline admin checks with is_admin() function
    - Replace inline manager checks with is_manager() function
  
  3. Performance Impact
    - Policies evaluated once per query instead of per row
    - Critical performance improvement for high-volume tables
*/

-- ============================================================================
-- CONTACTS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Only admins can delete contacts" ON contacts;
CREATE POLICY "Only admins can delete contacts"
  ON contacts FOR DELETE
  TO authenticated
  USING (is_admin());

DROP POLICY IF EXISTS "Portal users can view their own contact" ON contacts;
CREATE POLICY "Portal users can view their own contact"
  ON contacts FOR SELECT
  TO authenticated
  USING (portal_user_id = auth_uid());

DROP POLICY IF EXISTS "Users can update contacts they created or assigned to" ON contacts;
CREATE POLICY "Users can update contacts they created or assigned to"
  ON contacts FOR UPDATE
  TO authenticated
  USING (
    is_manager()
    OR user_can_view_record(office_id, assigned_to)
  );

DROP POLICY IF EXISTS "Users can view contacts based on office visibility" ON contacts;
CREATE POLICY "Users can view contacts based on office visibility"
  ON contacts FOR SELECT
  TO authenticated
  USING (
    is_manager()
    OR user_can_view_record(office_id, assigned_to)
    OR portal_user_id = auth_uid()
  );

-- ============================================================================
-- CONTACT CAPTURES POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their own contact captures" ON contact_captures;
CREATE POLICY "Users can view their own contact captures"
  ON contact_captures FOR SELECT
  TO authenticated
  USING (captured_by = auth_uid());

-- ============================================================================
-- DAILY CLOCK ENTRIES POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Admins can update daily clock entries" ON daily_clock_entries;
CREATE POLICY "Admins can update daily clock entries"
  ON daily_clock_entries FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Techs can create own daily clock entries" ON daily_clock_entries;
CREATE POLICY "Techs can create own daily clock entries"
  ON daily_clock_entries FOR INSERT
  TO authenticated
  WITH CHECK (technician_id = auth_uid());

DROP POLICY IF EXISTS "Techs can update own daily clock entries" ON daily_clock_entries;
CREATE POLICY "Techs can update own daily clock entries"
  ON daily_clock_entries FOR UPDATE
  TO authenticated
  USING (technician_id = auth_uid())
  WITH CHECK (technician_id = auth_uid());

DROP POLICY IF EXISTS "Techs can view own daily clock entries" ON daily_clock_entries;
CREATE POLICY "Techs can view own daily clock entries"
  ON daily_clock_entries FOR SELECT
  TO authenticated
  USING (technician_id = auth_uid() OR is_manager());

-- ============================================================================
-- DAILY CLOCK BREAKS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Techs can create breaks" ON daily_clock_breaks;
CREATE POLICY "Techs can create breaks"
  ON daily_clock_breaks FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM daily_clock_entries
      WHERE id = daily_clock_breaks.daily_clock_entry_id
      AND technician_id = auth_uid()
    )
  );

DROP POLICY IF EXISTS "Techs can update breaks" ON daily_clock_breaks;
CREATE POLICY "Techs can update breaks"
  ON daily_clock_breaks FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM daily_clock_entries
      WHERE id = daily_clock_breaks.daily_clock_entry_id
      AND technician_id = auth_uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM daily_clock_entries
      WHERE id = daily_clock_breaks.daily_clock_entry_id
      AND technician_id = auth_uid()
    )
  );

DROP POLICY IF EXISTS "Techs can view own breaks" ON daily_clock_breaks;
CREATE POLICY "Techs can view own breaks"
  ON daily_clock_breaks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM daily_clock_entries
      WHERE id = daily_clock_breaks.daily_clock_entry_id
      AND (technician_id = auth_uid() OR is_manager())
    )
  );

-- ============================================================================
-- CLOCK IN REWARDS LOG POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Techs can view own rewards log" ON clock_in_rewards_log;
CREATE POLICY "Techs can view own rewards log"
  ON clock_in_rewards_log FOR SELECT
  TO authenticated
  USING (technician_id = auth_uid() OR is_manager());

-- ============================================================================
-- COMMISSION RECORDS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own commission records" ON commission_records;
CREATE POLICY "Users can view own commission records"
  ON commission_records FOR SELECT
  TO authenticated
  USING (employee_id = auth_uid());

DROP POLICY IF EXISTS "Admin can manage all commission records" ON commission_records;
CREATE POLICY "Admin can manage all commission records"
  ON commission_records FOR ALL
  TO authenticated
  USING (is_admin());

-- ============================================================================
-- COMMISSION PAYMENTS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Admin can manage commission payments" ON commission_payments;
CREATE POLICY "Admin can manage commission payments"
  ON commission_payments FOR ALL
  TO authenticated
  USING (is_admin());

DROP POLICY IF EXISTS "Users can view own commission payments" ON commission_payments;
CREATE POLICY "Users can view own commission payments"
  ON commission_payments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM commission_records
      WHERE commission_records.id = commission_payments.commission_record_id
      AND commission_records.employee_id = auth_uid()
    )
  );

-- ============================================================================
-- COMMISSION ADJUSTMENTS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Admin can create commission adjustments" ON commission_adjustments;
CREATE POLICY "Admin can create commission adjustments"
  ON commission_adjustments FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admin can view commission adjustments" ON commission_adjustments;
CREATE POLICY "Admin can view commission adjustments"
  ON commission_adjustments FOR SELECT
  TO authenticated
  USING (is_admin());

-- ============================================================================
-- COMPANY COMMISSION SETTINGS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Admin can manage company commission settings" ON company_commission_settings;
CREATE POLICY "Admin can manage company commission settings"
  ON company_commission_settings FOR ALL
  TO authenticated
  USING (is_admin());
