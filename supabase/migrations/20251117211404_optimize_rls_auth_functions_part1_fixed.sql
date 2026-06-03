/*
  # Optimize RLS Auth Functions - Part 1 (Fixed)

  ## Overview
  Wraps auth.uid() calls in SELECT statements to prevent re-evaluation for each row.
  This significantly improves query performance at scale.

  ## Pattern
  Before: auth.uid() = user_id
  After: (SELECT auth.uid()) = user_id

  ## Tables Fixed
  - user_starred_modules
  - default_starred_modules  
  - department_modules
  - departments
  - push_subscriptions
  - user_visibility_settings
  - email_workflows
  - email_workflow_steps
  - email_workflow_enrollments
  - email_workflow_logs
*/

-- User starred modules
DROP POLICY IF EXISTS "Users can view own starred modules" ON public.user_starred_modules;
CREATE POLICY "Users can view own starred modules"
  ON public.user_starred_modules FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own starred modules" ON public.user_starred_modules;
CREATE POLICY "Users can insert own starred modules"
  ON public.user_starred_modules FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id AND
    EXISTS (
      SELECT 1 FROM department_modules dm
      JOIN departments d ON dm.department_id = d.id
      WHERE dm.id = module_id
      AND dm.is_active = true
      AND d.is_active = true
    )
  );

DROP POLICY IF EXISTS "Users can update own starred modules" ON public.user_starred_modules;
CREATE POLICY "Users can update own starred modules"
  ON public.user_starred_modules FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own starred modules" ON public.user_starred_modules;
CREATE POLICY "Users can delete own starred modules"
  ON public.user_starred_modules FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- Default starred modules
DROP POLICY IF EXISTS "Admins can manage default starred modules" ON public.default_starred_modules;
CREATE POLICY "Admins can manage default starred modules"
  ON public.default_starred_modules FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = 'admin'
    )
  );

-- Department modules
DROP POLICY IF EXISTS "Only admins can manage modules" ON public.department_modules;
CREATE POLICY "Only admins can manage modules"
  ON public.department_modules FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = 'admin'
    )
  );

-- Departments
DROP POLICY IF EXISTS "Only admins can manage departments" ON public.departments;
CREATE POLICY "Only admins can manage departments"
  ON public.departments FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = 'admin'
    )
  );

-- Push subscriptions
DROP POLICY IF EXISTS "Users can manage their own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can manage their own push subscriptions"
  ON public.push_subscriptions FOR ALL
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- User visibility settings
DROP POLICY IF EXISTS "Users can view own visibility settings" ON public.user_visibility_settings;
CREATE POLICY "Users can view own visibility settings"
  ON public.user_visibility_settings FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can insert own visibility settings" ON public.user_visibility_settings;
CREATE POLICY "Users can insert own visibility settings"
  ON public.user_visibility_settings FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update own visibility settings" ON public.user_visibility_settings;
CREATE POLICY "Users can update own visibility settings"
  ON public.user_visibility_settings FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Admins can manage visibility settings" ON public.user_visibility_settings;
CREATE POLICY "Admins can manage visibility settings"
  ON public.user_visibility_settings FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = 'admin'
    )
  );

-- Email workflows
DROP POLICY IF EXISTS "Users can view own company workflows" ON public.email_workflows;
CREATE POLICY "Users can view own company workflows"
  ON public.email_workflows FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE profiles.id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can create workflows" ON public.email_workflows;
CREATE POLICY "Users can create workflows"
  ON public.email_workflows FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM profiles WHERE profiles.id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can update own company workflows" ON public.email_workflows;
CREATE POLICY "Users can update own company workflows"
  ON public.email_workflows FOR UPDATE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE profiles.id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM profiles WHERE profiles.id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can delete own company workflows" ON public.email_workflows;
CREATE POLICY "Users can delete own company workflows"
  ON public.email_workflows FOR DELETE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE profiles.id = (SELECT auth.uid())
    )
  );

-- Email workflow steps
DROP POLICY IF EXISTS "Users can view workflow steps" ON public.email_workflow_steps;
CREATE POLICY "Users can view workflow steps"
  ON public.email_workflow_steps FOR SELECT
  TO authenticated
  USING (
    workflow_id IN (
      SELECT w.id FROM email_workflows w
      WHERE w.company_id IN (
        SELECT company_id FROM profiles WHERE profiles.id = (SELECT auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "Users can manage workflow steps" ON public.email_workflow_steps;
CREATE POLICY "Users can manage workflow steps"
  ON public.email_workflow_steps FOR ALL
  TO authenticated
  USING (
    workflow_id IN (
      SELECT w.id FROM email_workflows w
      WHERE w.company_id IN (
        SELECT company_id FROM profiles WHERE profiles.id = (SELECT auth.uid())
      )
    )
  )
  WITH CHECK (
    workflow_id IN (
      SELECT w.id FROM email_workflows w
      WHERE w.company_id IN (
        SELECT company_id FROM profiles WHERE profiles.id = (SELECT auth.uid())
      )
    )
  );

-- Email workflow enrollments
DROP POLICY IF EXISTS "Users can view enrollments" ON public.email_workflow_enrollments;
CREATE POLICY "Users can view enrollments"
  ON public.email_workflow_enrollments FOR SELECT
  TO authenticated
  USING (
    workflow_id IN (
      SELECT w.id FROM email_workflows w
      WHERE w.company_id IN (
        SELECT company_id FROM profiles WHERE profiles.id = (SELECT auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "Users can manage enrollments" ON public.email_workflow_enrollments;
CREATE POLICY "Users can manage enrollments"
  ON public.email_workflow_enrollments FOR ALL
  TO authenticated
  USING (
    workflow_id IN (
      SELECT w.id FROM email_workflows w
      WHERE w.company_id IN (
        SELECT company_id FROM profiles WHERE profiles.id = (SELECT auth.uid())
      )
    )
  )
  WITH CHECK (
    workflow_id IN (
      SELECT w.id FROM email_workflows w
      WHERE w.company_id IN (
        SELECT company_id FROM profiles WHERE profiles.id = (SELECT auth.uid())
      )
    )
  );

-- Email workflow logs
DROP POLICY IF EXISTS "Users can view workflow logs" ON public.email_workflow_logs;
CREATE POLICY "Users can view workflow logs"
  ON public.email_workflow_logs FOR SELECT
  TO authenticated
  USING (
    enrollment_id IN (
      SELECT e.id FROM email_workflow_enrollments e
      JOIN email_workflows w ON e.workflow_id = w.id
      WHERE w.company_id IN (
        SELECT company_id FROM profiles WHERE profiles.id = (SELECT auth.uid())
      )
    )
  );
