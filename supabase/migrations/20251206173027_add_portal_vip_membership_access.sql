/*
  # Add Portal User Access for VIP Membership Management

  ## Overview
  Allow portal users (customers) to view available VIP plans and manage their own subscriptions
  through the customer portal.

  ## Changes

  1. **recurring_plans RLS Policies**
    - Add policy for portal users to view active VIP plans
    - Portal users can only see plans that are active and have punchlist enabled

  2. **recurring_subscriptions RLS Policies**
    - Add policy for portal users to view their own subscriptions
    - Add policy for portal users to insert subscriptions (subscribe to plans)
    - Add policy for portal users to update their own subscriptions (cancel)
    - Portal users can only see/modify subscriptions tied to their contact_id

  ## Security
    - Portal users cannot see inactive or non-VIP plans
    - Portal users can only access their own subscription data
    - No access to other customers' subscriptions
    - Maintains existing staff access policies
*/

-- ============================================
-- 1. RECURRING PLANS - Add portal user view access
-- ============================================

-- Allow portal users to view active VIP plans
CREATE POLICY "Portal users can view active VIP plans"
  ON recurring_plans FOR SELECT
  TO authenticated
  USING (
    is_active = true 
    AND punchlist_enabled = true
    AND plan_type = 'vip_plan'
  );

-- ============================================
-- 2. RECURRING SUBSCRIPTIONS - Add portal user access
-- ============================================

-- Allow portal users to view their own subscriptions
CREATE POLICY "Portal users can view own subscriptions"
  ON recurring_subscriptions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.contact_id = recurring_subscriptions.contact_id
    )
  );

-- Allow portal users to create subscriptions for themselves
CREATE POLICY "Portal users can create own subscriptions"
  ON recurring_subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.contact_id = recurring_subscriptions.contact_id
    )
  );

-- Allow portal users to update (cancel) their own subscriptions
CREATE POLICY "Portal users can update own subscriptions"
  ON recurring_subscriptions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.contact_id = recurring_subscriptions.contact_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.contact_id = recurring_subscriptions.contact_id
    )
  );
