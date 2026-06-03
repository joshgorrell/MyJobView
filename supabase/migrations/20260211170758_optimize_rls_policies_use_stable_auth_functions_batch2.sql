/*
  # Optimize RLS Policies - Batch 2: Commission and Settings Tables
  
  1. Performance Optimization
    - Replace auth.uid() with auth_uid() stable function
    - Replace role checks with is_admin() helper function
    - Dramatically improves query performance on these frequently accessed tables
  
  2. Tables Covered - Batch 2
    - commission_payment_batches
    - commission_payments
    - commission_records
    - commission_statements
    - company_settings
    - organization_secrets
    - customers
    - portal_io_cache
    - recurring_subscriptions
*/

-- Commission payment batches
DROP POLICY IF EXISTS "Admin and Finance can manage payment batches" ON commission_payment_batches;
CREATE POLICY "Admin and Finance can manage payment batches"
  ON commission_payment_batches FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth_uid()
      AND role IN ('admin', 'finance')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth_uid()
      AND role IN ('admin', 'finance')
    )
  );

-- Commission payments
DROP POLICY IF EXISTS "Admin and Finance can manage commission payments" ON commission_payments;
CREATE POLICY "Admin and Finance can manage commission payments"
  ON commission_payments FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth_uid()
      AND role IN ('admin', 'finance')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth_uid()
      AND role IN ('admin', 'finance')
    )
  );

-- Commission records
DROP POLICY IF EXISTS "Admin and Finance can manage all commission records" ON commission_records;
CREATE POLICY "Admin and Finance can manage all commission records"
  ON commission_records FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth_uid()
      AND role IN ('admin', 'finance')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth_uid()
      AND role IN ('admin', 'finance')
    )
  );

-- Commission statements
DROP POLICY IF EXISTS "Admin and Finance can manage statements" ON commission_statements;
CREATE POLICY "Admin and Finance can manage statements"
  ON commission_statements FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth_uid()
      AND role IN ('admin', 'finance')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth_uid()
      AND role IN ('admin', 'finance')
    )
  );

-- Company settings
DROP POLICY IF EXISTS "Admin users can update company settings" ON company_settings;
CREATE POLICY "Admin users can update company settings"
  ON company_settings FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Organization secrets
DROP POLICY IF EXISTS "Only admins can update organization secrets" ON organization_secrets;
CREATE POLICY "Only admins can update organization secrets"
  ON organization_secrets FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth_uid()
      AND organization_id = organization_secrets.organization_id
      AND role IN ('admin', 'owner')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth_uid()
      AND organization_id = organization_secrets.organization_id
      AND role IN ('admin', 'owner')
    )
  );

-- Customers
DROP POLICY IF EXISTS "Authorized users can update customers" ON customers;
CREATE POLICY "Authorized users can update customers"
  ON customers FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth_uid()
      AND organization_id = customers.organization_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth_uid()
      AND organization_id = customers.organization_id
    )
  );

-- Portal IO cache
DROP POLICY IF EXISTS "Admins can manage portal.io cache" ON portal_io_cache;
CREATE POLICY "Admins can manage portal.io cache"
  ON portal_io_cache FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Recurring subscriptions
DROP POLICY IF EXISTS "Portal users can update own subscriptions" ON recurring_subscriptions;
CREATE POLICY "Portal users can update own subscriptions"
  ON recurring_subscriptions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth_uid()
      AND contact_id = recurring_subscriptions.contact_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth_uid()
      AND contact_id = recurring_subscriptions.contact_id
    )
  );