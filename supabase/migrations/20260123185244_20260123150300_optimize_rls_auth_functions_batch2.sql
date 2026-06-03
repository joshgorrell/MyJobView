/*
  # Optimize RLS Policies - Batch 2
  
  1. Performance Optimization
    - Wrap auth.uid() calls in SELECT to prevent re-evaluation
    - Improves RLS policy performance significantly
    
  2. Tables Optimized (7 tables)
    - leads
    - notifications
    - products
    - profiles
    - projects
    - proposals
    
  3. Security
    - No changes to access control logic
    - Only performance optimization of existing policies
*/

-- leads policies
DROP POLICY IF EXISTS "Admin can delete leads" ON public.leads;
CREATE POLICY "Admin can delete leads" ON public.leads
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
    AND profiles.role = 'admin'
  )
);

DROP POLICY IF EXISTS "Authenticated users can create leads" ON public.leads;
CREATE POLICY "Authenticated users can create leads" ON public.leads
FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT auth.uid()) IS NOT NULL
);

-- notifications policies
DROP POLICY IF EXISTS "Users can delete their own notifications" ON public.notifications;
CREATE POLICY "Users can delete their own notifications" ON public.notifications
FOR DELETE
TO authenticated
USING (
  user_id = (SELECT auth.uid())
);

-- products policies
DROP POLICY IF EXISTS "Users can delete company products" ON public.products;
CREATE POLICY "Users can delete company products" ON public.products
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
    AND profiles.can_edit_products = true
  )
);

DROP POLICY IF EXISTS "Users can insert company products" ON public.products;
CREATE POLICY "Users can insert company products" ON public.products
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
    AND profiles.can_edit_products = true
  )
);

DROP POLICY IF EXISTS "Users can update company products" ON public.products;
CREATE POLICY "Users can update company products" ON public.products
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
    AND profiles.can_edit_products = true
  )
);

DROP POLICY IF EXISTS "Users can view company products" ON public.products;
CREATE POLICY "Users can view company products" ON public.products
FOR SELECT
TO authenticated
USING (
  (SELECT auth.uid()) IS NOT NULL
);

-- profiles policies
DROP POLICY IF EXISTS "Admins can delete profiles" ON public.profiles;
CREATE POLICY "Admins can delete profiles" ON public.profiles
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles admin_profile
    WHERE admin_profile.id = (SELECT auth.uid())
    AND admin_profile.role = 'admin'
  )
);

DROP POLICY IF EXISTS "Users can insert own profile on signup" ON public.profiles;
CREATE POLICY "Users can insert own profile on signup" ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (
  id = (SELECT auth.uid())
);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
FOR UPDATE
TO authenticated
USING (
  id = (SELECT auth.uid())
);

DROP POLICY IF EXISTS "Users can view other active profiles" ON public.profiles;
CREATE POLICY "Users can view other active profiles" ON public.profiles
FOR SELECT
TO authenticated
USING (
  id <> (SELECT auth.uid()) AND is_active = true
);

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
FOR SELECT
TO authenticated
USING (
  id = (SELECT auth.uid())
);

-- projects policies
DROP POLICY IF EXISTS "Portal users can view their projects" ON public.projects;
CREATE POLICY "Portal users can view their projects" ON public.projects
FOR SELECT
TO authenticated
USING (
  contact_id IN (
    SELECT contacts.id FROM public.contacts
    WHERE contacts.portal_user_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "Staff can create projects in their company" ON public.projects;
CREATE POLICY "Staff can create projects in their company" ON public.projects
FOR INSERT
TO authenticated
WITH CHECK (
  company_id IN (
    SELECT profiles.id FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "Staff can delete projects in their company" ON public.projects;
CREATE POLICY "Staff can delete projects in their company" ON public.projects
FOR DELETE
TO authenticated
USING (
  company_id IN (
    SELECT profiles.id FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "Staff can update projects in their company" ON public.projects;
CREATE POLICY "Staff can update projects in their company" ON public.projects
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

DROP POLICY IF EXISTS "Staff can view projects in their company" ON public.projects;
CREATE POLICY "Staff can view projects in their company" ON public.projects
FOR SELECT
TO authenticated
USING (
  company_id IN (
    SELECT profiles.id FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
  )
);

-- proposals policies (complex ones with multiple auth.uid() calls)
DROP POLICY IF EXISTS "Authenticated users can update proposals" ON public.proposals;
CREATE POLICY "Authenticated users can update proposals" ON public.proposals
FOR UPDATE
TO authenticated
USING (
  (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = 'admin'
    )
  ) OR (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.proposal_visibility_scope = 'company'
    )
  ) OR (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.proposal_visibility_scope = 'office'
    ) AND (
      office_id IS NULL OR office_id IN (
        SELECT user_offices.office_id FROM public.user_offices
        WHERE user_offices.user_id = (SELECT auth.uid())
      )
    )
  ) OR (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.proposal_visibility_scope = 'own'
    ) AND created_by = (SELECT auth.uid())
  )
)
WITH CHECK (
  (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = 'admin'
    )
  ) OR (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.proposal_visibility_scope = 'company'
    )
  ) OR (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.proposal_visibility_scope = 'office'
    ) AND (
      office_id IS NULL OR office_id IN (
        SELECT user_offices.office_id FROM public.user_offices
        WHERE user_offices.user_id = (SELECT auth.uid())
      )
    )
  ) OR (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.proposal_visibility_scope = 'own'
    ) AND created_by = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "Portal users can view their proposals" ON public.proposals;
CREATE POLICY "Portal users can view their proposals" ON public.proposals
FOR SELECT
TO authenticated
USING (
  contact_id IN (
    SELECT contacts.id FROM public.contacts
    WHERE contacts.portal_user_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "Sales can create proposals" ON public.proposals;
CREATE POLICY "Sales can create proposals" ON public.proposals
FOR INSERT
TO authenticated
WITH CHECK (
  (
    SELECT profiles.role FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
  ) IN ('sales', 'admin')
);

DROP POLICY IF EXISTS "Sales can delete proposals" ON public.proposals;
CREATE POLICY "Sales can delete proposals" ON public.proposals
FOR DELETE
TO authenticated
USING (
  (
    SELECT profiles.role FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
  ) IN ('sales', 'admin')
);

DROP POLICY IF EXISTS "Users can view proposals with visibility scope" ON public.proposals;
CREATE POLICY "Users can view proposals with visibility scope" ON public.proposals
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
    AND (
      p.role = 'admin' OR
      p.proposal_visibility_scope = 'company' OR
      (
        p.proposal_visibility_scope = 'office' AND (
          proposals.office_id IS NULL OR proposals.office_id IN (
            SELECT user_offices.office_id FROM public.user_offices
            WHERE user_offices.user_id = (SELECT auth.uid())
          )
        )
      ) OR
      (
        p.proposal_visibility_scope = 'own' AND proposals.created_by = (SELECT auth.uid())
      )
    )
  )
);
