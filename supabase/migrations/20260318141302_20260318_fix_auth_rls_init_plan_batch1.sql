/*
  # Fix Auth RLS Initialization Plan - Batch 1

  ## Summary
  Replaces `auth.uid()` with `(select auth.uid())` in RLS policies to prevent
  per-row re-evaluation of authentication functions, improving query performance.

  ## Tables Fixed
  - company_settings: Admin/manager update policy
  - customer_contact_log: Insert, view, delete policies
  - customer_satisfaction: Insert, update, view policies
  - design_briefs: All 6 policies
  - session_logout_schedule: All 3 policies
  - vehicles: Update and delete policies
  - yearly_sales_performance: All 3 policies
*/

-- ============================================================
-- company_settings
-- ============================================================
DROP POLICY IF EXISTS "Admin and manager users can update company settings" ON public.company_settings;
CREATE POLICY "Admin and manager users can update company settings"
  ON public.company_settings FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
    AND profiles.role = ANY (ARRAY['admin'::text, 'manager'::text])
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
    AND profiles.role = ANY (ARRAY['admin'::text, 'manager'::text])
  ));

-- ============================================================
-- customer_contact_log
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can insert contact logs in their org" ON public.customer_contact_log;
CREATE POLICY "Authenticated users can insert contact logs in their org"
  ON public.customer_contact_log FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id = (SELECT profiles.organization_id FROM profiles WHERE profiles.id = (SELECT auth.uid()))
    AND logged_by = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "Authenticated users can view contact logs in their org" ON public.customer_contact_log;
CREATE POLICY "Authenticated users can view contact logs in their org"
  ON public.customer_contact_log FOR SELECT
  TO authenticated
  USING (organization_id = (SELECT profiles.organization_id FROM profiles WHERE profiles.id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Users can delete their own contact log entries" ON public.customer_contact_log;
CREATE POLICY "Users can delete their own contact log entries"
  ON public.customer_contact_log FOR DELETE
  TO authenticated
  USING (logged_by = (SELECT auth.uid()));

-- ============================================================
-- customer_satisfaction
-- ============================================================
DROP POLICY IF EXISTS "Users can create satisfaction records in their org" ON public.customer_satisfaction;
CREATE POLICY "Users can create satisfaction records in their org"
  ON public.customer_satisfaction FOR INSERT
  TO authenticated
  WITH CHECK (organization_id IN (
    SELECT profiles.organization_id FROM profiles WHERE profiles.id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "Users can update satisfaction records in their org" ON public.customer_satisfaction;
CREATE POLICY "Users can update satisfaction records in their org"
  ON public.customer_satisfaction FOR UPDATE
  TO authenticated
  USING (organization_id IN (
    SELECT profiles.organization_id FROM profiles WHERE profiles.id = (SELECT auth.uid())
  ))
  WITH CHECK (organization_id IN (
    SELECT profiles.organization_id FROM profiles WHERE profiles.id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "Users can view satisfaction records in their org" ON public.customer_satisfaction;
CREATE POLICY "Users can view satisfaction records in their org"
  ON public.customer_satisfaction FOR SELECT
  TO authenticated
  USING (organization_id IN (
    SELECT profiles.organization_id FROM profiles WHERE profiles.id = (SELECT auth.uid())
  ));

-- ============================================================
-- design_briefs
-- ============================================================
DROP POLICY IF EXISTS "Admins and managers can update any design brief" ON public.design_briefs;
CREATE POLICY "Admins and managers can update any design brief"
  ON public.design_briefs FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
    AND profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'service_manager'::text])
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
    AND profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'service_manager'::text])
  ));

DROP POLICY IF EXISTS "Admins and managers can view all design briefs" ON public.design_briefs;
CREATE POLICY "Admins and managers can view all design briefs"
  ON public.design_briefs FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
    AND profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'service_manager'::text])
  ));

DROP POLICY IF EXISTS "Authenticated users can create design briefs" ON public.design_briefs;
CREATE POLICY "Authenticated users can create design briefs"
  ON public.design_briefs FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = created_by);

DROP POLICY IF EXISTS "Creators can delete own draft or submitted briefs" ON public.design_briefs;
CREATE POLICY "Creators can delete own draft or submitted briefs"
  ON public.design_briefs FOR DELETE
  TO authenticated
  USING (
    created_by = (SELECT auth.uid())
    AND status = ANY (ARRAY['draft'::text, 'submitted'::text])
  );

DROP POLICY IF EXISTS "Creators can update own non-completed briefs" ON public.design_briefs;
CREATE POLICY "Creators can update own non-completed briefs"
  ON public.design_briefs FOR UPDATE
  TO authenticated
  USING (
    created_by = (SELECT auth.uid())
    AND status = ANY (ARRAY['draft'::text, 'submitted'::text])
  )
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND status = ANY (ARRAY['draft'::text, 'submitted'::text])
  );

DROP POLICY IF EXISTS "Users can view own design briefs" ON public.design_briefs;
CREATE POLICY "Users can view own design briefs"
  ON public.design_briefs FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = created_by);

-- ============================================================
-- session_logout_schedule
-- ============================================================
DROP POLICY IF EXISTS "Admins can insert session logout schedule" ON public.session_logout_schedule;
CREATE POLICY "Admins can insert session logout schedule"
  ON public.session_logout_schedule FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
    AND profiles.role = ANY (ARRAY['admin'::text, 'superadmin'::text])
  ));

DROP POLICY IF EXISTS "Admins can update session logout schedule" ON public.session_logout_schedule;
CREATE POLICY "Admins can update session logout schedule"
  ON public.session_logout_schedule FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
    AND profiles.role = ANY (ARRAY['admin'::text, 'superadmin'::text])
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
    AND profiles.role = ANY (ARRAY['admin'::text, 'superadmin'::text])
  ));

DROP POLICY IF EXISTS "Admins can view session logout schedule" ON public.session_logout_schedule;
CREATE POLICY "Admins can view session logout schedule"
  ON public.session_logout_schedule FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
    AND profiles.role = ANY (ARRAY['admin'::text, 'superadmin'::text])
  ));

-- ============================================================
-- vehicles
-- ============================================================
DROP POLICY IF EXISTS "Admins and managers can update vehicles" ON public.vehicles;
CREATE POLICY "Admins and managers can update vehicles"
  ON public.vehicles FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
    AND profiles.role = ANY (ARRAY['admin'::text, 'manager'::text])
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
    AND profiles.role = ANY (ARRAY['admin'::text, 'manager'::text])
  ));

DROP POLICY IF EXISTS "Admins can delete vehicles" ON public.vehicles;
CREATE POLICY "Admins can delete vehicles"
  ON public.vehicles FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
    AND profiles.role = 'admin'::text
  ));

-- ============================================================
-- yearly_sales_performance
-- ============================================================
DROP POLICY IF EXISTS "Admin and Managers can view all yearly sales performance" ON public.yearly_sales_performance;
CREATE POLICY "Admin and Managers can view all yearly sales performance"
  ON public.yearly_sales_performance FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
    AND profiles.role = ANY (ARRAY['admin'::text, 'manager'::text])
  ));

DROP POLICY IF EXISTS "Admin can manage yearly sales performance" ON public.yearly_sales_performance;
CREATE POLICY "Admin can manage yearly sales performance"
  ON public.yearly_sales_performance FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
    AND profiles.role = 'admin'::text
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
    AND profiles.role = 'admin'::text
  ));

DROP POLICY IF EXISTS "Users can view own yearly sales performance" ON public.yearly_sales_performance;
CREATE POLICY "Users can view own yearly sales performance"
  ON public.yearly_sales_performance FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);
