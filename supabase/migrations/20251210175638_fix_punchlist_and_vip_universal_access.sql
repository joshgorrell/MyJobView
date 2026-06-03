/*
  # Fix Punchlist and VIP Module Universal Access

  1. Changes
    - Update punchlist_tasks RLS to allow all authenticated users to see all company data
    - Update punchlist_task_photos RLS to allow all authenticated users to see all company data
    - Update punchlist_task_history RLS to allow all authenticated users to see all company data
    - Update punchlist_access_grants RLS to allow all authenticated users to see all company data
    - Update pending_punchlist_invites RLS to allow all authenticated users to see all company data
    - Update recurring_plans RLS to allow all authenticated users to see all company data
    - Update recurring_subscriptions RLS to allow all authenticated users to see all company data
    - Update recurring_invoices RLS to allow all authenticated users to see all company data
    - Update subscription_cancellations RLS to allow all authenticated users to see all company data

  2. Security
    - Users must still be authenticated
    - All data remains company-scoped (single tenant)
    - Access control is handled at the application/module level
*/

-- =====================================================
-- PUNCHLIST SYSTEM - UNIVERSAL ACCESS FOR MODULE USERS
-- =====================================================

-- Drop existing punchlist_tasks policies
DROP POLICY IF EXISTS "Portal users can view their punchlist tasks" ON punchlist_tasks;
DROP POLICY IF EXISTS "Portal users can create punchlist tasks" ON punchlist_tasks;
DROP POLICY IF EXISTS "Portal users can update their punchlist tasks" ON punchlist_tasks;
DROP POLICY IF EXISTS "Portal users can delete their punchlist tasks" ON punchlist_tasks;
DROP POLICY IF EXISTS "Authenticated users can view punchlist tasks" ON punchlist_tasks;
DROP POLICY IF EXISTS "Authenticated users can create punchlist tasks" ON punchlist_tasks;
DROP POLICY IF EXISTS "Authenticated users can update punchlist tasks" ON punchlist_tasks;
DROP POLICY IF EXISTS "Authenticated users can delete punchlist tasks" ON punchlist_tasks;
DROP POLICY IF EXISTS "Authenticated users can view all punchlist tasks" ON punchlist_tasks;

-- Create new universal access policies for punchlist_tasks
CREATE POLICY "All authenticated users can view punchlist tasks"
  ON punchlist_tasks FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "All authenticated users can create punchlist tasks"
  ON punchlist_tasks FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "All authenticated users can update punchlist tasks"
  ON punchlist_tasks FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "All authenticated users can delete punchlist tasks"
  ON punchlist_tasks FOR DELETE
  TO authenticated
  USING (true);

-- Drop existing punchlist_task_photos policies
DROP POLICY IF EXISTS "Users can view task photos" ON punchlist_task_photos;
DROP POLICY IF EXISTS "Users can upload task photos" ON punchlist_task_photos;
DROP POLICY IF EXISTS "Users can delete task photos" ON punchlist_task_photos;
DROP POLICY IF EXISTS "Authenticated users can view punchlist task photos" ON punchlist_task_photos;
DROP POLICY IF EXISTS "Authenticated users can view all punchlist task photos" ON punchlist_task_photos;
DROP POLICY IF EXISTS "Authenticated users can create punchlist task photos" ON punchlist_task_photos;
DROP POLICY IF EXISTS "Authenticated users can delete punchlist task photos" ON punchlist_task_photos;

-- Create new universal access policies for punchlist_task_photos
CREATE POLICY "All authenticated users can view punchlist task photos"
  ON punchlist_task_photos FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "All authenticated users can create punchlist task photos"
  ON punchlist_task_photos FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "All authenticated users can delete punchlist task photos"
  ON punchlist_task_photos FOR DELETE
  TO authenticated
  USING (true);

-- Drop existing punchlist_task_history policies
DROP POLICY IF EXISTS "Users can view task history" ON punchlist_task_history;
DROP POLICY IF EXISTS "Authenticated users can view task history" ON punchlist_task_history;

-- Create new universal access policy for punchlist_task_history
CREATE POLICY "All authenticated users can view punchlist task history"
  ON punchlist_task_history FOR SELECT
  TO authenticated
  USING (true);

-- Drop existing punchlist_access_grants policies
DROP POLICY IF EXISTS "Users can view access grants" ON punchlist_access_grants;
DROP POLICY IF EXISTS "Users can create access grants" ON punchlist_access_grants;
DROP POLICY IF EXISTS "Users can update access grants" ON punchlist_access_grants;
DROP POLICY IF EXISTS "Authenticated users can view access grants" ON punchlist_access_grants;
DROP POLICY IF EXISTS "Authenticated users can create access grants" ON punchlist_access_grants;
DROP POLICY IF EXISTS "Authenticated users can update access grants" ON punchlist_access_grants;

-- Create new universal access policies for punchlist_access_grants
CREATE POLICY "All authenticated users can view punchlist access grants"
  ON punchlist_access_grants FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "All authenticated users can create punchlist access grants"
  ON punchlist_access_grants FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "All authenticated users can update punchlist access grants"
  ON punchlist_access_grants FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "All authenticated users can delete punchlist access grants"
  ON punchlist_access_grants FOR DELETE
  TO authenticated
  USING (true);

-- Drop existing pending_punchlist_invites policies
DROP POLICY IF EXISTS "Users can view pending invites" ON pending_punchlist_invites;
DROP POLICY IF EXISTS "Users can create pending invites" ON pending_punchlist_invites;
DROP POLICY IF EXISTS "Users can update pending invites" ON pending_punchlist_invites;
DROP POLICY IF EXISTS "Users can delete pending invites" ON pending_punchlist_invites;
DROP POLICY IF EXISTS "Authenticated users can view pending invites" ON pending_punchlist_invites;
DROP POLICY IF EXISTS "Authenticated users can create pending invites" ON pending_punchlist_invites;
DROP POLICY IF EXISTS "Authenticated users can update pending invites" ON pending_punchlist_invites;
DROP POLICY IF EXISTS "Authenticated users can delete pending invites" ON pending_punchlist_invites;

-- Create new universal access policies for pending_punchlist_invites
CREATE POLICY "All authenticated users can view pending punchlist invites"
  ON pending_punchlist_invites FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "All authenticated users can create pending punchlist invites"
  ON pending_punchlist_invites FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "All authenticated users can update pending punchlist invites"
  ON pending_punchlist_invites FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "All authenticated users can delete pending punchlist invites"
  ON pending_punchlist_invites FOR DELETE
  TO authenticated
  USING (true);

-- =====================================================
-- VIP/RECURRING SYSTEM - UNIVERSAL ACCESS FOR MODULE USERS
-- =====================================================

-- Drop existing recurring_plans policies
DROP POLICY IF EXISTS "Users can view recurring plans" ON recurring_plans;
DROP POLICY IF EXISTS "Users can create recurring plans" ON recurring_plans;
DROP POLICY IF EXISTS "Users can update recurring plans" ON recurring_plans;
DROP POLICY IF EXISTS "Users can delete recurring plans" ON recurring_plans;
DROP POLICY IF EXISTS "Authenticated users can view recurring plans" ON recurring_plans;
DROP POLICY IF EXISTS "Authenticated users can view all recurring plans" ON recurring_plans;
DROP POLICY IF EXISTS "Authenticated users can create recurring plans" ON recurring_plans;
DROP POLICY IF EXISTS "Authenticated users can update recurring plans" ON recurring_plans;
DROP POLICY IF EXISTS "Authenticated users can delete recurring plans" ON recurring_plans;

-- Create new universal access policies for recurring_plans
CREATE POLICY "All authenticated users can view recurring plans"
  ON recurring_plans FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "All authenticated users can create recurring plans"
  ON recurring_plans FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "All authenticated users can update recurring plans"
  ON recurring_plans FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "All authenticated users can delete recurring plans"
  ON recurring_plans FOR DELETE
  TO authenticated
  USING (true);

-- Drop existing recurring_subscriptions policies
DROP POLICY IF EXISTS "Users can view subscriptions" ON recurring_subscriptions;
DROP POLICY IF EXISTS "Users can create subscriptions" ON recurring_subscriptions;
DROP POLICY IF EXISTS "Users can update subscriptions" ON recurring_subscriptions;
DROP POLICY IF EXISTS "Portal users can view their subscriptions" ON recurring_subscriptions;
DROP POLICY IF EXISTS "Authenticated users can view subscriptions" ON recurring_subscriptions;
DROP POLICY IF EXISTS "Authenticated users can view all recurring subscriptions" ON recurring_subscriptions;
DROP POLICY IF EXISTS "Authenticated users can create recurring subscriptions" ON recurring_subscriptions;
DROP POLICY IF EXISTS "Authenticated users can update recurring subscriptions" ON recurring_subscriptions;
DROP POLICY IF EXISTS "Authenticated users can delete recurring subscriptions" ON recurring_subscriptions;

-- Create new universal access policies for recurring_subscriptions
CREATE POLICY "All authenticated users can view recurring subscriptions"
  ON recurring_subscriptions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "All authenticated users can create recurring subscriptions"
  ON recurring_subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "All authenticated users can update recurring subscriptions"
  ON recurring_subscriptions FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "All authenticated users can delete recurring subscriptions"
  ON recurring_subscriptions FOR DELETE
  TO authenticated
  USING (true);

-- Drop existing recurring_invoices policies
DROP POLICY IF EXISTS "Users can view recurring invoices" ON recurring_invoices;
DROP POLICY IF EXISTS "Users can create recurring invoices" ON recurring_invoices;
DROP POLICY IF EXISTS "Users can update recurring invoices" ON recurring_invoices;
DROP POLICY IF EXISTS "Authenticated users can view recurring invoices" ON recurring_invoices;
DROP POLICY IF EXISTS "Authenticated users can view all recurring invoices" ON recurring_invoices;
DROP POLICY IF EXISTS "Authenticated users can create recurring invoices" ON recurring_invoices;
DROP POLICY IF EXISTS "Authenticated users can update recurring invoices" ON recurring_invoices;
DROP POLICY IF EXISTS "Authenticated users can delete recurring invoices" ON recurring_invoices;

-- Create new universal access policies for recurring_invoices
CREATE POLICY "All authenticated users can view recurring invoices"
  ON recurring_invoices FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "All authenticated users can create recurring invoices"
  ON recurring_invoices FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "All authenticated users can update recurring invoices"
  ON recurring_invoices FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "All authenticated users can delete recurring invoices"
  ON recurring_invoices FOR DELETE
  TO authenticated
  USING (true);

-- Drop existing subscription_cancellations policies
DROP POLICY IF EXISTS "Users can view cancellations" ON subscription_cancellations;
DROP POLICY IF EXISTS "Users can create cancellations" ON subscription_cancellations;
DROP POLICY IF EXISTS "Users can update cancellations" ON subscription_cancellations;
DROP POLICY IF EXISTS "Authenticated users can view cancellations" ON subscription_cancellations;
DROP POLICY IF EXISTS "Authenticated users can view all subscription cancellations" ON subscription_cancellations;
DROP POLICY IF EXISTS "Authenticated users can create subscription cancellations" ON subscription_cancellations;
DROP POLICY IF EXISTS "Authenticated users can update subscription cancellations" ON subscription_cancellations;

-- Create new universal access policies for subscription_cancellations
CREATE POLICY "All authenticated users can view subscription cancellations"
  ON subscription_cancellations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "All authenticated users can create subscription cancellations"
  ON subscription_cancellations FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "All authenticated users can update subscription cancellations"
  ON subscription_cancellations FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "All authenticated users can delete subscription cancellations"
  ON subscription_cancellations FOR DELETE
  TO authenticated
  USING (true);

-- =====================================================
-- RELATED TABLES - SUBSCRIPTION LINE ITEMS
-- =====================================================

-- Drop existing subscription_line_items policies
DROP POLICY IF EXISTS "Users can view subscription line items" ON subscription_line_items;
DROP POLICY IF EXISTS "Users can create subscription line items" ON subscription_line_items;
DROP POLICY IF EXISTS "Users can update subscription line items" ON subscription_line_items;
DROP POLICY IF EXISTS "Users can delete subscription line items" ON subscription_line_items;
DROP POLICY IF EXISTS "Authenticated users can view subscription line items" ON subscription_line_items;
DROP POLICY IF EXISTS "Authenticated users can create subscription line items" ON subscription_line_items;
DROP POLICY IF EXISTS "Authenticated users can update subscription line items" ON subscription_line_items;
DROP POLICY IF EXISTS "Authenticated users can delete subscription line items" ON subscription_line_items;

-- Create new universal access policies for subscription_line_items
CREATE POLICY "All authenticated users can view subscription line items"
  ON subscription_line_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "All authenticated users can create subscription line items"
  ON subscription_line_items FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "All authenticated users can update subscription line items"
  ON subscription_line_items FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "All authenticated users can delete subscription line items"
  ON subscription_line_items FOR DELETE
  TO authenticated
  USING (true);
