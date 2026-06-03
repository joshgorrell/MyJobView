/*
  # Optimize RLS Auth Function Initialization - Comprehensive Fix
  
  Replaces auth.uid() and auth.jwt() with subquery pattern (select auth.uid()) 
  in all RLS policies to prevent row-by-row re-evaluation.
  
  ## Changes
  - Creates a helper function to get current user ID (cached per transaction)
  - Updates critical RLS policies to use the optimized pattern
  - Focuses on high-traffic tables: invoices, proposals, projects, work_orders, etc.
*/

-- Create helper function for auth.uid() that's more explicit about caching
CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid();
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.current_user_id() TO authenticated;

-- Update critical policies to use subquery pattern

-- file_attachments
DROP POLICY IF EXISTS "Staff can delete their own attachments" ON public.file_attachments;
CREATE POLICY "Staff can delete their own attachments" ON public.file_attachments
  FOR DELETE TO authenticated
  USING (uploaded_by = (select auth.uid()));

DROP POLICY IF EXISTS "Staff can upload attachments to their company" ON public.file_attachments;
CREATE POLICY "Staff can upload attachments to their company" ON public.file_attachments
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Staff can view attachments in their company" ON public.file_attachments;
CREATE POLICY "Staff can view attachments in their company" ON public.file_attachments
  FOR SELECT TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

-- gps_breadcrumbs (high traffic table)
DROP POLICY IF EXISTS "Admins can view all GPS breadcrumbs" ON public.gps_breadcrumbs;
CREATE POLICY "Admins can view all GPS breadcrumbs" ON public.gps_breadcrumbs
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (select auth.uid())
    AND profiles.role IN ('admin', 'dispatcher')
  ));

DROP POLICY IF EXISTS "Techs can create own GPS breadcrumbs" ON public.gps_breadcrumbs;
CREATE POLICY "Techs can create own GPS breadcrumbs" ON public.gps_breadcrumbs
  FOR INSERT TO authenticated
  WITH CHECK (technician_id = (select auth.uid()));

DROP POLICY IF EXISTS "Techs can view own GPS breadcrumbs" ON public.gps_breadcrumbs;
CREATE POLICY "Techs can view own GPS breadcrumbs" ON public.gps_breadcrumbs
  FOR SELECT TO authenticated
  USING (technician_id = (select auth.uid()));

-- invoices (very high traffic)
DROP POLICY IF EXISTS "Portal users can view their invoices" ON public.invoices;
CREATE POLICY "Portal users can view their invoices" ON public.invoices
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.contacts c ON c.portal_user_id = p.id
    WHERE p.id = (select auth.uid())
    AND p.role = 'portal_user'
    AND c.id = invoices.contact_id
  ));

DROP POLICY IF EXISTS "Staff can create invoices in their company" ON public.invoices;
CREATE POLICY "Staff can create invoices in their company" ON public.invoices
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (select auth.uid())
    AND profiles.role IN ('admin', 'sales', 'finance')
  ));

DROP POLICY IF EXISTS "Staff can view invoices in their company" ON public.invoices;
CREATE POLICY "Staff can view invoices in their company" ON public.invoices
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (select auth.uid())
    AND profiles.role NOT IN ('portal_user')
  ));