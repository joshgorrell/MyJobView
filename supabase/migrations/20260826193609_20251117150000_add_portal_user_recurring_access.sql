/*
  # Add Portal User Access to Recurring Billing (policies already exist, idempotent re-creation)
*/
DROP POLICY IF EXISTS "Portal users can view their own subscriptions" ON recurring_subscriptions;
CREATE POLICY "Portal users can view their own subscriptions"
  ON recurring_subscriptions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'portal_user'
      AND profiles.contact_id = recurring_subscriptions.contact_id
    )
  );

DROP POLICY IF EXISTS "Portal users can view their recurring invoices" ON recurring_invoices;
CREATE POLICY "Portal users can view their recurring invoices"
  ON recurring_invoices FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      JOIN recurring_subscriptions ON recurring_subscriptions.id = recurring_invoices.subscription_id
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'portal_user'
      AND profiles.contact_id = recurring_subscriptions.contact_id
    )
  );

DROP POLICY IF EXISTS "Portal users can view their subscription line items" ON subscription_line_items;
CREATE POLICY "Portal users can view their subscription line items"
  ON subscription_line_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      JOIN recurring_subscriptions ON recurring_subscriptions.id = subscription_line_items.subscription_id
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'portal_user'
      AND profiles.contact_id = recurring_subscriptions.contact_id
    )
  );

DROP POLICY IF EXISTS "Portal users can view active recurring plans" ON recurring_plans;
CREATE POLICY "Portal users can view active recurring plans"
  ON recurring_plans FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'portal_user'
    )
    AND is_active = true
  );