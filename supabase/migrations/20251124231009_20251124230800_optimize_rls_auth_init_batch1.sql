/*
  # Optimize RLS Auth Function Initialization - Batch 1
  
  Replaces auth.uid() with (select auth.uid()) in RLS policies to improve performance.
  This prevents re-evaluation of auth functions for each row.
  
  ## Changes
  - Updates RLS policies to use subquery pattern for auth functions
  - Covers clock_out_rewards_log through discussion_posts tables
*/

-- clock_out_rewards_log
DROP POLICY IF EXISTS "Techs can view own clock out rewards" ON public.clock_out_rewards_log;
CREATE POLICY "Techs can view own clock out rewards" ON public.clock_out_rewards_log
  FOR SELECT TO authenticated
  USING (technician_id = (select auth.uid()));

-- contracts
DROP POLICY IF EXISTS "Admins can delete contracts" ON public.contracts;
CREATE POLICY "Admins can delete contracts" ON public.contracts
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (select auth.uid())
    AND profiles.role IN ('admin')
  ));

DROP POLICY IF EXISTS "Admins can insert contracts" ON public.contracts;
CREATE POLICY "Admins can insert contracts" ON public.contracts
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (select auth.uid())
    AND profiles.role IN ('admin')
  ));

DROP POLICY IF EXISTS "Admins can update contracts" ON public.contracts;
CREATE POLICY "Admins can update contracts" ON public.contracts
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (select auth.uid())
    AND profiles.role IN ('admin')
  ));

-- department_role_access
DROP POLICY IF EXISTS "Only admins can manage department role access" ON public.department_role_access;
CREATE POLICY "Only admins can manage department role access" ON public.department_role_access
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (select auth.uid())
    AND profiles.role = 'admin'
  ));

-- department_user_overrides
DROP POLICY IF EXISTS "Only admins can manage department user overrides" ON public.department_user_overrides;
CREATE POLICY "Only admins can manage department user overrides" ON public.department_user_overrides
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (select auth.uid())
    AND profiles.role = 'admin'
  ));

DROP POLICY IF EXISTS "Users can view own department overrides" ON public.department_user_overrides;
CREATE POLICY "Users can view own department overrides" ON public.department_user_overrides
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

-- distance_matrix_cache
DROP POLICY IF EXISTS "System can manage distance cache" ON public.distance_matrix_cache;
CREATE POLICY "System can manage distance cache" ON public.distance_matrix_cache
  FOR ALL TO authenticated
  USING ((select auth.uid()) IS NOT NULL);