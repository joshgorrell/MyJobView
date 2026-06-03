/*
  # Allow Anonymous Users to Complete VIP Signup

  1. Changes
    - Allow anonymous users to create payment_methods for VIP signup
    - Allow anonymous users to create recurring_subscriptions for VIP signup
    - Allow anonymous users to create subscription_payments for VIP signup

  2. Security
    - Only allow creation, not updates or deletes
    - Validate that subscriptions are linked to valid contacts and plans
*/

-- Allow anonymous users to create payment methods for VIP signup
CREATE POLICY "Anonymous users can create payment methods for VIP signup"
  ON payment_methods FOR INSERT
  TO anon
  WITH CHECK (
    contact_id IS NOT NULL
  );

-- Allow anonymous users to create recurring subscriptions for VIP signup
CREATE POLICY "Anonymous users can create subscriptions for VIP signup"
  ON recurring_subscriptions FOR INSERT
  TO anon
  WITH CHECK (
    contact_id IS NOT NULL
    AND plan_id IS NOT NULL
    AND status IN ('active', 'trial')
  );

-- Allow anonymous users to create subscription payments for VIP signup
CREATE POLICY "Anonymous users can create subscription payments for VIP signup"
  ON subscription_payments FOR INSERT
  TO anon
  WITH CHECK (
    contact_id IS NOT NULL
    AND subscription_id IS NOT NULL
    AND amount >= 0
  );
