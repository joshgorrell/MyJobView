/*
  # Fix Auth RLS Initialization - Batch 1

  1. Performance Improvements
    - Optimize auth function calls in RLS policies
    - Wrap auth.uid() in SELECT to evaluate once per query, not per row
    - Improves query performance at scale

  2. Tables Fixed
    - customers (3 policies)
    - portal_views (3 policies)
    - subscription_cancellations (2 policies)
    - security_contract_cancellations (2 policies)
*/

-- Fix customers table policies
DROP POLICY IF EXISTS "Authorized users can delete customers" ON public.customers;
CREATE POLICY "Authorized users can delete customers"
  ON public.customers
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (SELECT auth.uid())
      AND organization_id = customers.organization_id
      AND role IN ('Admin', 'Global Admin', 'Sales')
    )
  );

DROP POLICY IF EXISTS "Authorized users can insert customers" ON public.customers;
CREATE POLICY "Authorized users can insert customers"
  ON public.customers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (SELECT auth.uid())
      AND organization_id = customers.organization_id
      AND role IN ('Admin', 'Global Admin', 'Sales')
    )
  );

DROP POLICY IF EXISTS "Users can view customers in their organization" ON public.customers;
CREATE POLICY "Users can view customers in their organization"
  ON public.customers
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (SELECT auth.uid())
      AND organization_id = customers.organization_id
    )
  );

-- Fix portal_views table policies
DROP POLICY IF EXISTS "Customers can insert own portal views" ON public.portal_views;
CREATE POLICY "Customers can insert own portal views"
  ON public.portal_views
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.contacts c ON c.id = p.contact_id
      WHERE p.id = (SELECT auth.uid())
      AND c.id = portal_views.contact_id
    )
  );

DROP POLICY IF EXISTS "Customers can view own portal activity" ON public.portal_views;
CREATE POLICY "Customers can view own portal activity"
  ON public.portal_views
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.contacts c ON c.id = p.contact_id
      WHERE p.id = (SELECT auth.uid())
      AND c.id = portal_views.contact_id
    )
  );

DROP POLICY IF EXISTS "Internal users can view all portal activity" ON public.portal_views;
CREATE POLICY "Internal users can view all portal activity"
  ON public.portal_views
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (SELECT auth.uid())
      AND organization_id = portal_views.organization_id
      AND role NOT IN ('Portal User')
    )
  );

-- Fix subscription_cancellations table policies
DROP POLICY IF EXISTS "Portal users can cancel their own subscriptions" ON public.subscription_cancellations;
CREATE POLICY "Portal users can cancel their own subscriptions"
  ON public.subscription_cancellations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.contacts c ON c.id = p.contact_id
      JOIN public.recurring_subscriptions rs ON rs.contact_id = c.id
      WHERE p.id = (SELECT auth.uid())
      AND rs.id = subscription_cancellations.subscription_id
    )
  );

DROP POLICY IF EXISTS "Portal users can view their own cancellations" ON public.subscription_cancellations;
CREATE POLICY "Portal users can view their own cancellations"
  ON public.subscription_cancellations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.contacts c ON c.id = p.contact_id
      JOIN public.recurring_subscriptions rs ON rs.contact_id = c.id
      WHERE p.id = (SELECT auth.uid())
      AND rs.id = subscription_cancellations.subscription_id
    )
  );

-- Fix security_contract_cancellations table policies
DROP POLICY IF EXISTS "Portal users can create cancellations" ON public.security_contract_cancellations;
CREATE POLICY "Portal users can create cancellations"
  ON public.security_contract_cancellations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.contacts c ON c.id = p.contact_id
      JOIN public.security_contracts sc ON sc.contact_id = c.id
      WHERE p.id = (SELECT auth.uid())
      AND sc.id = security_contract_cancellations.contract_id
    )
  );

DROP POLICY IF EXISTS "Portal users can view own cancellations" ON public.security_contract_cancellations;
CREATE POLICY "Portal users can view own cancellations"
  ON public.security_contract_cancellations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.contacts c ON c.id = p.contact_id
      JOIN public.security_contracts sc ON sc.contact_id = c.id
      WHERE p.id = (SELECT auth.uid())
      AND sc.id = security_contract_cancellations.contract_id
    )
  );
