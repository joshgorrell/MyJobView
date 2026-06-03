/*
  # Add Portal User Access to Recurring Billing

  ## Summary
  Adds RLS policies so portal users (customers) can view their own recurring subscriptions,
  recurring invoices, and subscription line items.

  ## Changes
  1. Add RLS policy for portal users to view their own subscriptions
  2. Add RLS policy for portal users to view their recurring invoices
  3. Add RLS policy for portal users to view subscription line items
  4. Add RLS policy for portal users to view recurring plans (for reference)

  ## Security
  - Portal users can ONLY view data linked to their contact_id
  - Portal users CANNOT create, update, or delete any recurring billing data
  - All policies verify the user's contact_id matches the subscription's contact_id
*/

-- Policy for portal users to view their own subscriptions
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

-- Policy for portal users to view their recurring invoices
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

-- Policy for portal users to view their subscription line items
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

-- Policy for portal users to view recurring plans (for reference only)
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
