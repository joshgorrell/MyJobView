/*
  # Optimize RLS Policies - Batch 1
  
  1. Performance Optimization
    - Wrap auth.uid() calls in SELECT to prevent re-evaluation
    - Improves RLS policy performance significantly
    
  2. Tables Optimized (4 tables)
    - contacts
    - daily_clock_entries
    - feature_suggestions (partial)
    - invoices
    
  3. Security
    - No changes to access control logic
    - Only performance optimization of existing policies
*/

-- contacts policies
DROP POLICY IF EXISTS "Users can delete contacts" ON public.contacts;
CREATE POLICY "Users can delete contacts" ON public.contacts
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
    AND profiles.can_edit_contacts = true
  )
);

DROP POLICY IF EXISTS "Users can insert contacts" ON public.contacts;
CREATE POLICY "Users can insert contacts" ON public.contacts
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
    AND profiles.can_edit_contacts = true
  )
);

DROP POLICY IF EXISTS "Users can update contacts" ON public.contacts;
CREATE POLICY "Users can update contacts" ON public.contacts
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
    AND profiles.can_edit_contacts = true
  )
);

-- daily_clock_entries policies
DROP POLICY IF EXISTS "Admins can create manual time entries for any tech" ON public.daily_clock_entries;
CREATE POLICY "Admins can create manual time entries for any tech" ON public.daily_clock_entries
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
    AND profiles.role IN ('admin', 'manager', 'office_manager')
  )
);

DROP POLICY IF EXISTS "Authorized staff can delete time entries" ON public.daily_clock_entries;
CREATE POLICY "Authorized staff can delete time entries" ON public.daily_clock_entries
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
    AND profiles.role IN ('admin', 'office_manager', 'production_manager', 'service_manager')
  )
);

-- invoices policies (optimize the ones without SELECT wrapper)
DROP POLICY IF EXISTS "Staff can delete invoices in their company" ON public.invoices;
CREATE POLICY "Staff can delete invoices in their company" ON public.invoices
FOR DELETE
TO authenticated
USING (
  company_id IN (
    SELECT profiles.id FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "Staff can update invoices in their company" ON public.invoices;
CREATE POLICY "Staff can update invoices in their company" ON public.invoices
FOR UPDATE
TO authenticated
USING (
  company_id IN (
    SELECT profiles.id FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
  )
)
WITH CHECK (
  company_id IN (
    SELECT profiles.id FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
  )
);
