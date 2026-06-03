/*
  # Fix Auth RLS Initialization - Batch 2

  1. Performance Improvements
    - Optimize auth function calls in RLS policies
    - Wrap auth.uid() in SELECT for stable evaluation

  2. Tables Fixed
    - discussion_posts
    - commission_adjustments
    - paparazzi_requests
    - file_attachments
    - payments
    - user_starred_modules
    - recurring_plans
    - recurring_invoices
    - signup_attempts
*/

-- Fix discussion_posts
DROP POLICY IF EXISTS "discussion_posts_delete_same_org" ON public.discussion_posts;
CREATE POLICY "discussion_posts_delete_same_org"
  ON public.discussion_posts
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (SELECT auth.uid())
      AND organization_id = discussion_posts.organization_id
    )
  );

-- Fix commission_adjustments
DROP POLICY IF EXISTS "Admin and Finance can create commission adjustments" ON public.commission_adjustments;
CREATE POLICY "Admin and Finance can create commission adjustments"
  ON public.commission_adjustments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (SELECT auth.uid())
      AND organization_id = commission_adjustments.organization_id
      AND role IN ('Admin', 'Finance', 'Global Admin')
    )
  );

DROP POLICY IF EXISTS "Admin and Finance can view commission adjustments" ON public.commission_adjustments;
CREATE POLICY "Admin and Finance can view commission adjustments"
  ON public.commission_adjustments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (SELECT auth.uid())
      AND organization_id = commission_adjustments.organization_id
      AND role IN ('Admin', 'Finance', 'Global Admin')
    )
  );

-- Fix paparazzi_requests
DROP POLICY IF EXISTS "Users can create paparazzi requests" ON public.paparazzi_requests;
CREATE POLICY "Users can create paparazzi requests"
  ON public.paparazzi_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (SELECT auth.uid())
      AND organization_id = paparazzi_requests.organization_id
    )
  );

DROP POLICY IF EXISTS "Users can update their own requests and admins can update any" ON public.paparazzi_requests;
CREATE POLICY "Users can update their own requests and admins can update any"
  ON public.paparazzi_requests
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (SELECT auth.uid())
      AND organization_id = paparazzi_requests.organization_id
      AND (id = paparazzi_requests.requested_by OR role IN ('Admin', 'Service Manager', 'Global Admin'))
    )
  );

DROP POLICY IF EXISTS "Users can view requests in their organization" ON public.paparazzi_requests;
CREATE POLICY "Users can view requests in their organization"
  ON public.paparazzi_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (SELECT auth.uid())
      AND organization_id = paparazzi_requests.organization_id
    )
  );

-- Fix file_attachments
DROP POLICY IF EXISTS "file_attachments_delete_same_org" ON public.file_attachments;
CREATE POLICY "file_attachments_delete_same_org"
  ON public.file_attachments
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (SELECT auth.uid())
      AND organization_id = file_attachments.organization_id
    )
  );

-- Fix payments
DROP POLICY IF EXISTS "Portal users can view their payments" ON public.payments;
CREATE POLICY "Portal users can view their payments"
  ON public.payments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.contacts c ON c.id = p.contact_id
      JOIN public.invoices i ON i.contact_id = c.id
      WHERE p.id = (SELECT auth.uid())
      AND i.id = payments.invoice_id
    )
    OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (SELECT auth.uid())
      AND organization_id = payments.organization_id
      AND role NOT IN ('Portal User')
    )
  );

-- Fix user_starred_modules
DROP POLICY IF EXISTS "user_starred_modules_delete_same_org" ON public.user_starred_modules;
CREATE POLICY "user_starred_modules_delete_same_org"
  ON public.user_starred_modules
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (SELECT auth.uid())
      AND organization_id = user_starred_modules.organization_id
      AND id = user_starred_modules.user_id
    )
  );

DROP POLICY IF EXISTS "user_starred_modules_insert_same_org" ON public.user_starred_modules;
CREATE POLICY "user_starred_modules_insert_same_org"
  ON public.user_starred_modules
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (SELECT auth.uid())
      AND organization_id = user_starred_modules.organization_id
      AND id = user_starred_modules.user_id
    )
  );

DROP POLICY IF EXISTS "user_starred_modules_select_same_org" ON public.user_starred_modules;
CREATE POLICY "user_starred_modules_select_same_org"
  ON public.user_starred_modules
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (SELECT auth.uid())
      AND organization_id = user_starred_modules.organization_id
    )
  );

-- Fix recurring_plans
DROP POLICY IF EXISTS "Portal users can view active recurring plans" ON public.recurring_plans;
CREATE POLICY "Portal users can view active recurring plans"
  ON public.recurring_plans
  FOR SELECT
  TO authenticated
  USING (
    is_active = true
    AND show_on_portal = true
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (SELECT auth.uid())
    )
  );

-- Fix recurring_invoices
DROP POLICY IF EXISTS "Portal users can view their recurring invoices" ON public.recurring_invoices;
CREATE POLICY "Portal users can view their recurring invoices"
  ON public.recurring_invoices
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.contacts c ON c.id = p.contact_id
      JOIN public.recurring_subscriptions rs ON rs.contact_id = c.id
      WHERE p.id = (SELECT auth.uid())
      AND rs.id = recurring_invoices.subscription_id
    )
  );

-- Fix signup_attempts
DROP POLICY IF EXISTS "Anonymous can update recent signup attempts by email" ON public.signup_attempts;
CREATE POLICY "Anonymous can update recent signup attempts by email"
  ON public.signup_attempts
  FOR UPDATE
  TO anon
  USING (
    created_at > now() - interval '1 hour'
  );
