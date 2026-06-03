/*
  # Optimize RLS Policies - Batch 3
  
  1. Performance Optimization
    - Wrap auth.uid() calls in SELECT to prevent re-evaluation
    - Improves RLS policy performance significantly
    
  2. Tables Optimized (6 tables)
    - job_photos
    - recurring_subscriptions
    - tasks
    - user_starred_modules
    - work_order_tasks
    - work_orders
    
  3. Security
    - No changes to access control logic
    - Only performance optimization of existing policies
*/

-- job_photos policies
DROP POLICY IF EXISTS "Staff can view job photos" ON public.job_photos;
CREATE POLICY "Staff can view job photos" ON public.job_photos
FOR SELECT
TO authenticated
USING (
  (SELECT auth.uid()) = technician_id OR
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
    AND profiles.role IN ('admin', 'manager', 'dispatch', 'sales')
  )
);

DROP POLICY IF EXISTS "Techs can create job photos" ON public.job_photos;
CREATE POLICY "Techs can create job photos" ON public.job_photos
FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT auth.uid()) = technician_id
);

DROP POLICY IF EXISTS "Techs can delete own job photos" ON public.job_photos;
CREATE POLICY "Techs can delete own job photos" ON public.job_photos
FOR DELETE
TO authenticated
USING (
  (SELECT auth.uid()) = technician_id
);

DROP POLICY IF EXISTS "Techs can update own job photos" ON public.job_photos;
CREATE POLICY "Techs can update own job photos" ON public.job_photos
FOR UPDATE
TO authenticated
USING (
  (SELECT auth.uid()) = technician_id
)
WITH CHECK (
  (SELECT auth.uid()) = technician_id
);

-- recurring_subscriptions policies
DROP POLICY IF EXISTS "Portal users can create own subscriptions" ON public.recurring_subscriptions;
CREATE POLICY "Portal users can create own subscriptions" ON public.recurring_subscriptions
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
    AND profiles.contact_id = recurring_subscriptions.contact_id
  )
);

DROP POLICY IF EXISTS "Portal users can update own subscriptions" ON public.recurring_subscriptions;
CREATE POLICY "Portal users can update own subscriptions" ON public.recurring_subscriptions
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
    AND profiles.contact_id = recurring_subscriptions.contact_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
    AND profiles.contact_id = recurring_subscriptions.contact_id
  )
);

DROP POLICY IF EXISTS "Portal users can view own subscriptions" ON public.recurring_subscriptions;
CREATE POLICY "Portal users can view own subscriptions" ON public.recurring_subscriptions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
    AND profiles.contact_id = recurring_subscriptions.contact_id
  )
);

DROP POLICY IF EXISTS "Portal users can view their own subscriptions" ON public.recurring_subscriptions;
CREATE POLICY "Portal users can view their own subscriptions" ON public.recurring_subscriptions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
    AND profiles.role = 'portal_user'
    AND profiles.contact_id = recurring_subscriptions.contact_id
  )
);

DROP POLICY IF EXISTS "Sales can insert subscriptions" ON public.recurring_subscriptions;
CREATE POLICY "Sales can insert subscriptions" ON public.recurring_subscriptions
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
    AND profiles.role IN ('admin', 'sales', 'manager')
  )
);

-- tasks policies
DROP POLICY IF EXISTS "Users can create tasks" ON public.tasks;
CREATE POLICY "Users can create tasks" ON public.tasks
FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT auth.uid()) IS NOT NULL
);

-- user_starred_modules policies
DROP POLICY IF EXISTS "Users can insert own starred modules" ON public.user_starred_modules;
CREATE POLICY "Users can insert own starred modules" ON public.user_starred_modules
FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT auth.uid()) = user_id AND
  star_order >= 1 AND star_order <= 6 AND
  EXISTS (
    SELECT 1 FROM public.department_modules dm
    WHERE dm.id = user_starred_modules.module_id
    AND dm.is_active = true
  )
);

-- work_order_tasks policies
DROP POLICY IF EXISTS "Managers can manage work order tasks" ON public.work_order_tasks;
CREATE POLICY "Managers can manage work order tasks" ON public.work_order_tasks
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
    AND profiles.role IN ('admin', 'office_manager', 'project_manager', 'production_manager')
  )
);

DROP POLICY IF EXISTS "Technicians can update their work order tasks" ON public.work_order_tasks;
CREATE POLICY "Technicians can update their work order tasks" ON public.work_order_tasks
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.work_orders wo
    WHERE wo.id = work_order_tasks.work_order_id
    AND wo.assigned_to = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "Users can view work order tasks" ON public.work_order_tasks;
CREATE POLICY "Users can view work order tasks" ON public.work_order_tasks
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.work_orders wo
    WHERE wo.id = work_order_tasks.work_order_id
    AND (
      wo.assigned_to = (SELECT auth.uid()) OR
      work_order_tasks.assigned_to = (SELECT auth.uid()) OR
      (
        work_order_tasks.shared_task = true AND
        wo.work_order_group_id IN (
          SELECT work_orders.work_order_group_id
          FROM public.work_orders
          WHERE work_orders.assigned_to = (SELECT auth.uid())
          AND work_orders.work_order_group_id IS NOT NULL
        )
      ) OR
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role IN ('admin', 'office_manager', 'project_manager', 'production_manager')
      )
    )
  )
);

-- work_orders policies
DROP POLICY IF EXISTS "Managers can create work orders" ON public.work_orders;
CREATE POLICY "Managers can create work orders" ON public.work_orders
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
    AND profiles.role IN ('admin', 'manager')
  )
);

DROP POLICY IF EXISTS "Technicians can create work orders for themselves" ON public.work_orders;
CREATE POLICY "Technicians can create work orders for themselves" ON public.work_orders
FOR INSERT
TO authenticated
WITH CHECK (
  assigned_to = (SELECT auth.uid()) OR
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
    AND profiles.role IN ('admin', 'office_manager', 'project_manager', 'service_manager')
  )
);
