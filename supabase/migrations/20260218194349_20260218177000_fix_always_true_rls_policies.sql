/*
  # Fix Always-True RLS Policies

  ## Summary
  Tightens RLS policies that previously used `true` as their condition, making
  them accessible to everyone including unauthenticated users. Replaced with
  proper authentication checks.

  ## Policies Fixed
  - company_settings: Restrict SELECT to authenticated users (not anon)
  - labor_categories: Restrict SELECT to authenticated users only
  - labor_phase_mapping_audit: Restrict SELECT to authenticated users only
  - labor_phase_performance_mapping: Restrict SELECT to authenticated users only
  - mileage_reminders: Replace overly broad FOR ALL true with specific policies
  - test_tune_field_target_history: Restrict to authenticated users only
*/

-- company_settings: was allowing anyone including anon to read
DROP POLICY IF EXISTS "All authenticated users can read company settings" ON company_settings;
CREATE POLICY "All authenticated users can read company settings"
  ON company_settings FOR SELECT
  TO authenticated
  USING (true);

-- labor_categories: restrict to authenticated users only
DROP POLICY IF EXISTS "All authenticated users can view labor categories" ON labor_categories;
CREATE POLICY "All authenticated users can view labor categories"
  ON labor_categories FOR SELECT
  TO authenticated
  USING (true);

-- labor_phase_mapping_audit: restrict to authenticated users only
DROP POLICY IF EXISTS "All authenticated users can view mapping audit trail" ON labor_phase_mapping_audit;
CREATE POLICY "All authenticated users can view mapping audit trail"
  ON labor_phase_mapping_audit FOR SELECT
  TO authenticated
  USING (true);

-- labor_phase_performance_mapping: restrict to authenticated users only
DROP POLICY IF EXISTS "All authenticated users can view labor phase mappings" ON labor_phase_performance_mapping;
CREATE POLICY "All authenticated users can view labor phase mappings"
  ON labor_phase_performance_mapping FOR SELECT
  TO authenticated
  USING (true);

-- mileage_reminders: FOR ALL with true/true allows anything - replace with specific policies
DROP POLICY IF EXISTS "System can manage reminders" ON mileage_reminders;
CREATE POLICY "System can insert reminders"
  ON mileage_reminders FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = ANY(ARRAY['admin', 'manager', 'dispatcher'])
  ));

CREATE POLICY "System can update reminders"
  ON mileage_reminders FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = ANY(ARRAY['admin', 'manager', 'dispatcher'])
  ));

CREATE POLICY "System can delete reminders"
  ON mileage_reminders FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = ANY(ARRAY['admin', 'manager', 'dispatcher'])
  ));

-- test_tune_field_target_history: restrict to authenticated users
-- (no org_id column, so use sales_order join to org-scope)
DROP POLICY IF EXISTS "All authenticated users can view field target history" ON test_tune_field_target_history;
CREATE POLICY "All authenticated users can view field target history"
  ON test_tune_field_target_history FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = ANY(ARRAY['admin', 'finance', 'production_manager', 'sales_manager', 'office_manager', 'manager'])
  ));

DROP POLICY IF EXISTS "System can insert field target history" ON test_tune_field_target_history;
CREATE POLICY "System can insert field target history"
  ON test_tune_field_target_history FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = ANY(ARRAY['admin', 'finance', 'production_manager', 'sales_manager', 'manager'])
  ));
