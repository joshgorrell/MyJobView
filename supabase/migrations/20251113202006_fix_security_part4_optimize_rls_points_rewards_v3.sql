/*
  # Fix Database Security - Part 4: Optimize RLS Policies (Points & Rewards)

  ## Changes
  - Optimized RLS policies for points and rewards system
  - Wraps auth.uid() in subqueries for better performance
  
  ## Tables Updated
  - points_configuration
  - rewards_catalog
  - priority_levels
  - points_transactions
  - reward_redemptions
  - priority_settings
  - discussion_post_bumps
  - email_templates
*/

-- Points configuration
DROP POLICY IF EXISTS "Admins can manage points configuration" ON public.points_configuration;
CREATE POLICY "Admins can manage points configuration"
  ON public.points_configuration FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = (select auth.uid()) AND role = 'admin'
    )
  );

-- Rewards catalog
DROP POLICY IF EXISTS "Admins can manage rewards catalog" ON public.rewards_catalog;
CREATE POLICY "Admins can manage rewards catalog"
  ON public.rewards_catalog FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = (select auth.uid()) AND role = 'admin'
    )
  );

-- Priority levels
DROP POLICY IF EXISTS "Admins can manage priority levels" ON public.priority_levels;
CREATE POLICY "Admins can manage priority levels"
  ON public.priority_levels FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = (select auth.uid()) AND role = 'admin'
    )
  );

-- Points transactions
DROP POLICY IF EXISTS "Admins can create transactions" ON public.points_transactions;
CREATE POLICY "Admins can create transactions"
  ON public.points_transactions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = (select auth.uid()) AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can view all transactions" ON public.points_transactions;
CREATE POLICY "Admins can view all transactions"
  ON public.points_transactions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = (select auth.uid()) AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Users can view own transactions" ON public.points_transactions;
CREATE POLICY "Users can view own transactions"
  ON public.points_transactions FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

-- Reward redemptions
DROP POLICY IF EXISTS "Admins can update redemptions" ON public.reward_redemptions;
CREATE POLICY "Admins can update redemptions"
  ON public.reward_redemptions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = (select auth.uid()) AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can view all redemptions" ON public.reward_redemptions;
CREATE POLICY "Admins can view all redemptions"
  ON public.reward_redemptions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = (select auth.uid()) AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Users can create redemptions" ON public.reward_redemptions;
CREATE POLICY "Users can create redemptions"
  ON public.reward_redemptions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can view own redemptions" ON public.reward_redemptions;
CREATE POLICY "Users can view own redemptions"
  ON public.reward_redemptions FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

-- Priority settings
DROP POLICY IF EXISTS "Admins can delete priority settings" ON public.priority_settings;
CREATE POLICY "Admins can delete priority settings"
  ON public.priority_settings FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = (select auth.uid()) AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can insert priority settings" ON public.priority_settings;
CREATE POLICY "Admins can insert priority settings"
  ON public.priority_settings FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = (select auth.uid()) AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can update priority settings" ON public.priority_settings;
CREATE POLICY "Admins can update priority settings"
  ON public.priority_settings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = (select auth.uid()) AND role = 'admin'
    )
  );

-- Discussion post bumps
DROP POLICY IF EXISTS "Users can bump others' posts" ON public.discussion_post_bumps;
CREATE POLICY "Users can bump others' posts"
  ON public.discussion_post_bumps FOR INSERT
  TO authenticated
  WITH CHECK (bumped_by = (select auth.uid()));

-- Email templates
DROP POLICY IF EXISTS "Admins can manage email templates" ON public.email_templates;
CREATE POLICY "Admins can manage email templates"
  ON public.email_templates FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = (select auth.uid()) AND role = 'admin'
    )
  );