/*
  # Optimize RLS Policies - Batch 4
  
  1. Performance Optimization
    - Wrap auth.uid() calls in SELECT to prevent re-evaluation
    - Improves RLS policy performance significantly
    
  2. Tables Optimized (4 tables)
    - punchlist_tasks
    - service_requests
    - subscription_payments
    - trip_segments
    
  3. Security
    - No changes to access control logic
    - Only performance optimization of existing policies
*/

-- punchlist_tasks policies
DROP POLICY IF EXISTS "Customers can update own punchlist tasks" ON public.punchlist_tasks;
CREATE POLICY "Customers can update own punchlist tasks" ON public.punchlist_tasks
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.punchlist_access_grants
    WHERE punchlist_access_grants.contact_id = punchlist_tasks.contact_id
    AND punchlist_access_grants.contact_id IN (
      SELECT profiles.contact_id FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
    )
    AND punchlist_access_grants.status = 'active'
    AND (
      punchlist_access_grants.expiration_date IS NULL OR
      punchlist_access_grants.expiration_date >= CURRENT_DATE
    )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.punchlist_access_grants
    WHERE punchlist_access_grants.contact_id = punchlist_tasks.contact_id
    AND punchlist_access_grants.contact_id IN (
      SELECT profiles.contact_id FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
    )
    AND punchlist_access_grants.status = 'active'
    AND (
      punchlist_access_grants.expiration_date IS NULL OR
      punchlist_access_grants.expiration_date >= CURRENT_DATE
    )
  )
);

DROP POLICY IF EXISTS "Portal users can create their own punchlist tasks" ON public.punchlist_tasks;
CREATE POLICY "Portal users can create their own punchlist tasks" ON public.punchlist_tasks
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
    AND profiles.role = 'portal_user'
    AND profiles.contact_id = punchlist_tasks.contact_id
  )
);

DROP POLICY IF EXISTS "Portal users can delete their own draft tasks" ON public.punchlist_tasks;
CREATE POLICY "Portal users can delete their own draft tasks" ON public.punchlist_tasks
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
    AND profiles.role = 'portal_user'
    AND profiles.contact_id = punchlist_tasks.contact_id
  ) AND status = 'draft'
);

DROP POLICY IF EXISTS "Portal users can update their own punchlist tasks" ON public.punchlist_tasks;
CREATE POLICY "Portal users can update their own punchlist tasks" ON public.punchlist_tasks
FOR UPDATE
TO authenticated
USING (
  contact_id IN (
    SELECT profiles.contact_id FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
    AND profiles.role = 'portal_user'
  )
);

DROP POLICY IF EXISTS "Portal users can view their own punchlist tasks" ON public.punchlist_tasks;
CREATE POLICY "Portal users can view their own punchlist tasks" ON public.punchlist_tasks
FOR SELECT
TO authenticated
USING (
  contact_id IN (
    SELECT profiles.contact_id FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
    AND profiles.role = 'portal_user'
  )
);

DROP POLICY IF EXISTS "Staff can create punchlist tasks for customers" ON public.punchlist_tasks;
CREATE POLICY "Staff can create punchlist tasks for customers" ON public.punchlist_tasks
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
    AND profiles.role IN ('admin', 'office_manager', 'production_manager', 'dispatch', 'sales_manager')
  )
);

DROP POLICY IF EXISTS "Staff can delete punchlist tasks" ON public.punchlist_tasks;
CREATE POLICY "Staff can delete punchlist tasks" ON public.punchlist_tasks
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
    AND profiles.role IN ('admin', 'office_manager', 'production_manager', 'dispatch')
  )
);

DROP POLICY IF EXISTS "Staff can update punchlist tasks" ON public.punchlist_tasks;
CREATE POLICY "Staff can update punchlist tasks" ON public.punchlist_tasks
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
    AND profiles.role IN ('admin', 'dispatch', 'manager', 'tech')
  )
);

DROP POLICY IF EXISTS "Staff can view all punchlist tasks" ON public.punchlist_tasks;
CREATE POLICY "Staff can view all punchlist tasks" ON public.punchlist_tasks
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
    AND profiles.role IN ('admin', 'sales', 'manager', 'dispatch', 'tech')
  )
);

-- service_requests policies
DROP POLICY IF EXISTS "Anyone authenticated can create service requests" ON public.service_requests;
CREATE POLICY "Anyone authenticated can create service requests" ON public.service_requests
FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT auth.uid()) = created_by
);

-- subscription_payments policies
DROP POLICY IF EXISTS "Admin subscription payments all" ON public.subscription_payments;
CREATE POLICY "Admin subscription payments all" ON public.subscription_payments
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
    AND p.role IN ('admin', 'owner', 'finance_manager')
  )
);

DROP POLICY IF EXISTS "Users can view own subscription payments" ON public.subscription_payments;
CREATE POLICY "Users can view own subscription payments" ON public.subscription_payments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
    AND p.contact_id = subscription_payments.contact_id
    AND p.contact_id IS NOT NULL
  )
);

-- trip_segments policies
DROP POLICY IF EXISTS "Managers can view all trips" ON public.trip_segments;
CREATE POLICY "Managers can view all trips" ON public.trip_segments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
    AND profiles.role IN ('admin', 'owner', 'dispatch', 'manager', 'production_manager', 'service_manager')
  )
);

DROP POLICY IF EXISTS "Technicians can view own trips" ON public.trip_segments;
CREATE POLICY "Technicians can view own trips" ON public.trip_segments
FOR SELECT
TO authenticated
USING (
  technician_id = (SELECT auth.uid())
);
