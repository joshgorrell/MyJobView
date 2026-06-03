/*
  # Fix Auth RLS Initialization Plan - Batch 3

  ## Summary
  Continues fixing RLS policies to use (select auth.uid()) for performance.

  ## Tables Fixed
  - punchlist_access_grants
  - push_subscriptions
  - recurring_invoices
  - recurring_plans
  - recurring_subscriptions
  - security_contract_cancellations
  - subscription_cancellations
  - subscription_line_items
  - task_comments
  - tenant_subscriptions
  - test_tune_bonus_approvals
  - test_tune_bonus_calculations
  - test_tune_bonus_history
  - test_tune_bonus_overrides
  - test_tune_elr_override_log
  - test_tune_performance_snapshots
  - test_tune_pm_metrics
  - test_tune_settings
  - test_tune_settings_history
  - time_entry_import_history
  - time_entry_import_profiles
  - user_column_preferences
  - vehicle_assignments
  - vehicles
*/

-- punchlist_access_grants
DROP POLICY IF EXISTS "Portal users can view their own punchlist access" ON punchlist_access_grants;
CREATE POLICY "Portal users can view their own punchlist access"
  ON punchlist_access_grants FOR SELECT
  TO authenticated
  USING (contact_id IN (
    SELECT profiles.contact_id FROM profiles
    WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'portal_user'
  ));

-- push_subscriptions
DROP POLICY IF EXISTS "push_subscriptions_delete_same_org" ON push_subscriptions;
CREATE POLICY "push_subscriptions_delete_same_org"
  ON push_subscriptions FOR DELETE
  TO authenticated
  USING (organization_id = get_user_org_id() AND user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "push_subscriptions_insert_same_org" ON push_subscriptions;
CREATE POLICY "push_subscriptions_insert_same_org"
  ON push_subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (organization_id = get_user_org_id() AND user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "push_subscriptions_select_same_org" ON push_subscriptions;
CREATE POLICY "push_subscriptions_select_same_org"
  ON push_subscriptions FOR SELECT
  TO authenticated
  USING (organization_id = get_user_org_id() AND user_id = (SELECT auth.uid()));

-- recurring_plans
DROP POLICY IF EXISTS "Portal users can view active recurring plans" ON recurring_plans;
CREATE POLICY "Portal users can view active recurring plans"
  ON recurring_plans FOR SELECT
  TO authenticated
  USING (
    is_active = true
    AND show_on_portal = true
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (SELECT auth.uid()))
  );

-- recurring_subscriptions
DROP POLICY IF EXISTS "Portal users can view their own subscriptions" ON recurring_subscriptions;
CREATE POLICY "Portal users can view their own subscriptions"
  ON recurring_subscriptions FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = 'portal_user'
      AND profiles.contact_id = recurring_subscriptions.contact_id
  ));

-- subscription_line_items
DROP POLICY IF EXISTS "Portal users can view their subscription line items" ON subscription_line_items;
CREATE POLICY "Portal users can view their subscription line items"
  ON subscription_line_items FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    JOIN recurring_subscriptions ON recurring_subscriptions.id = subscription_line_items.subscription_id
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = 'portal_user'
      AND profiles.contact_id = recurring_subscriptions.contact_id
  ));

-- task_comments
DROP POLICY IF EXISTS "task_comments_delete_same_org" ON task_comments;
CREATE POLICY "task_comments_delete_same_org"
  ON task_comments FOR DELETE
  TO authenticated
  USING (organization_id = get_user_org_id() AND user_id = (SELECT auth.uid()));

-- tenant_subscriptions
DROP POLICY IF EXISTS "Org admins can view own subscription" ON tenant_subscriptions;
CREATE POLICY "Org admins can view own subscription"
  ON tenant_subscriptions FOR SELECT
  TO authenticated
  USING (organization_id = (
    SELECT profiles.organization_id FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
  ));

-- test_tune_bonus_approvals
DROP POLICY IF EXISTS "Finance and Admin can create approvals" ON test_tune_bonus_approvals;
CREATE POLICY "Finance and Admin can create approvals"
  ON test_tune_bonus_approvals FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = ANY(ARRAY['admin', 'finance'])
  ));

DROP POLICY IF EXISTS "Staff can view bonus approvals" ON test_tune_bonus_approvals;
CREATE POLICY "Staff can view bonus approvals"
  ON test_tune_bonus_approvals FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = ANY(ARRAY['admin', 'finance', 'production_manager', 'sales_manager'])
  ));

-- test_tune_bonus_calculations
DROP POLICY IF EXISTS "Finance and Admin can update bonus calculations" ON test_tune_bonus_calculations;
CREATE POLICY "Finance and Admin can update bonus calculations"
  ON test_tune_bonus_calculations FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = ANY(ARRAY['admin', 'finance'])
  ));

DROP POLICY IF EXISTS "Staff can view bonus calculations" ON test_tune_bonus_calculations;
CREATE POLICY "Staff can view bonus calculations"
  ON test_tune_bonus_calculations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = ANY(ARRAY['admin', 'finance', 'production_manager', 'sales_manager', 'office_manager'])
    )
    OR lead_technician_id = (SELECT auth.uid())
    OR project_manager_id = (SELECT auth.uid())
  );

-- test_tune_bonus_history
DROP POLICY IF EXISTS "Staff can view bonus history" ON test_tune_bonus_history;
CREATE POLICY "Staff can view bonus history"
  ON test_tune_bonus_history FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = ANY(ARRAY['admin', 'finance', 'production_manager', 'sales_manager'])
  ));

-- test_tune_bonus_overrides
DROP POLICY IF EXISTS "Admins can insert overrides" ON test_tune_bonus_overrides;
CREATE POLICY "Admins can insert overrides"
  ON test_tune_bonus_overrides FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id = ((SELECT auth.jwt()) ->> 'organization_id')::uuid
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = ANY(ARRAY['admin', 'super_admin', 'sales_manager'])
    )
  );

DROP POLICY IF EXISTS "Admins can update overrides" ON test_tune_bonus_overrides;
CREATE POLICY "Admins can update overrides"
  ON test_tune_bonus_overrides FOR UPDATE
  TO authenticated
  USING (
    organization_id = ((SELECT auth.jwt()) ->> 'organization_id')::uuid
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = ANY(ARRAY['admin', 'super_admin', 'sales_manager'])
    )
  );

DROP POLICY IF EXISTS "Users can view overrides in their organization" ON test_tune_bonus_overrides;
CREATE POLICY "Users can view overrides in their organization"
  ON test_tune_bonus_overrides FOR SELECT
  TO authenticated
  USING (organization_id = ((SELECT auth.jwt()) ->> 'organization_id')::uuid);

-- test_tune_elr_override_log
DROP POLICY IF EXISTS "Admins can insert ELR override log" ON test_tune_elr_override_log;
CREATE POLICY "Admins can insert ELR override log"
  ON test_tune_elr_override_log FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = ANY(ARRAY['admin', 'super_admin', 'finance', 'sales_manager'])
  ));

DROP POLICY IF EXISTS "Admins can view ELR override log" ON test_tune_elr_override_log;
CREATE POLICY "Admins can view ELR override log"
  ON test_tune_elr_override_log FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = ANY(ARRAY['admin', 'super_admin', 'finance', 'sales_manager'])
  ));

-- test_tune_performance_snapshots
DROP POLICY IF EXISTS "Staff can view test tune snapshots" ON test_tune_performance_snapshots;
CREATE POLICY "Staff can view test tune snapshots"
  ON test_tune_performance_snapshots FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = ANY(ARRAY['admin', 'finance', 'production_manager', 'sales_manager', 'office_manager'])
  ));

-- test_tune_pm_metrics
DROP POLICY IF EXISTS "PMs can view their own metrics" ON test_tune_pm_metrics;
CREATE POLICY "PMs can view their own metrics"
  ON test_tune_pm_metrics FOR SELECT
  TO authenticated
  USING (
    organization_id = ((SELECT auth.jwt()) ->> 'organization_id')::uuid
    AND (
      pm_id = (SELECT auth.uid())
      OR EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = (SELECT auth.uid())
          AND profiles.role = ANY(ARRAY['admin', 'super_admin', 'manager', 'service_manager', 'sales_manager'])
      )
    )
  );

-- test_tune_settings
DROP POLICY IF EXISTS "Admin and sales managers can update test tune settings" ON test_tune_settings;
CREATE POLICY "Admin and sales managers can update test tune settings"
  ON test_tune_settings FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = ANY(ARRAY['admin', 'sales_manager'])
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = ANY(ARRAY['admin', 'sales_manager'])
  ));

DROP POLICY IF EXISTS "Staff can view test tune settings" ON test_tune_settings;
CREATE POLICY "Staff can view test tune settings"
  ON test_tune_settings FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = ANY(ARRAY['admin', 'finance', 'production_manager', 'sales_manager', 'office_manager'])
  ));

-- test_tune_settings_history
DROP POLICY IF EXISTS "Admins can insert settings history" ON test_tune_settings_history;
CREATE POLICY "Admins can insert settings history"
  ON test_tune_settings_history FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = ANY(ARRAY['admin', 'super_admin', 'finance', 'sales_manager'])
  ));

DROP POLICY IF EXISTS "Admins can manage settings history" ON test_tune_settings_history;
CREATE POLICY "Admins can manage settings history"
  ON test_tune_settings_history FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = ANY(ARRAY['admin', 'super_admin', 'finance'])
  ));

-- time_entry_import_history
DROP POLICY IF EXISTS "Users can create import history" ON time_entry_import_history;
CREATE POLICY "Users can create import history"
  ON time_entry_import_history FOR INSERT
  TO authenticated
  WITH CHECK (imported_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can view own import history" ON time_entry_import_history;
CREATE POLICY "Users can view own import history"
  ON time_entry_import_history FOR SELECT
  TO authenticated
  USING (
    imported_by = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = ANY(ARRAY['admin', 'production_manager', 'dispatch'])
    )
  );

-- time_entry_import_profiles
DROP POLICY IF EXISTS "Users can create own profiles" ON time_entry_import_profiles;
CREATE POLICY "Users can create own profiles"
  ON time_entry_import_profiles FOR INSERT
  TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can delete own profiles" ON time_entry_import_profiles;
CREATE POLICY "Users can delete own profiles"
  ON time_entry_import_profiles FOR DELETE
  TO authenticated
  USING (created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can view own and shared profiles" ON time_entry_import_profiles;
CREATE POLICY "Users can view own and shared profiles"
  ON time_entry_import_profiles FOR SELECT
  TO authenticated
  USING (created_by = (SELECT auth.uid()) OR is_shared = true);

-- user_column_preferences
DROP POLICY IF EXISTS "user_column_preferences_delete_same_org" ON user_column_preferences;
CREATE POLICY "user_column_preferences_delete_same_org"
  ON user_column_preferences FOR DELETE
  TO authenticated
  USING (organization_id = get_user_org_id() AND user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "user_column_preferences_insert_same_org" ON user_column_preferences;
CREATE POLICY "user_column_preferences_insert_same_org"
  ON user_column_preferences FOR INSERT
  TO authenticated
  WITH CHECK (organization_id = get_user_org_id() AND user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "user_column_preferences_select_same_org" ON user_column_preferences;
CREATE POLICY "user_column_preferences_select_same_org"
  ON user_column_preferences FOR SELECT
  TO authenticated
  USING (organization_id = get_user_org_id() AND user_id = (SELECT auth.uid()));

-- vehicle_assignments
DROP POLICY IF EXISTS "Admins and managers can manage vehicle assignments" ON vehicle_assignments;
CREATE POLICY "Admins and managers can manage vehicle assignments"
  ON vehicle_assignments FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = ANY(ARRAY['admin', 'manager'])
  ));

DROP POLICY IF EXISTS "Users can view their vehicle assignments" ON vehicle_assignments;
CREATE POLICY "Users can view their vehicle assignments"
  ON vehicle_assignments FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = ANY(ARRAY['admin', 'manager'])
    )
  );

-- vehicles
DROP POLICY IF EXISTS "Admins and managers can insert vehicles" ON vehicles;
CREATE POLICY "Admins and managers can insert vehicles"
  ON vehicles FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = ANY(ARRAY['admin', 'manager'])
  ));
