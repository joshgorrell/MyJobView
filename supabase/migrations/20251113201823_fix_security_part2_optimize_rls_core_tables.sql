/*
  # Fix Database Security - Part 2: Optimize RLS Policies (Core Tables)

  ## Changes
  - Optimized RLS policies to use (select auth.uid()) instead of auth.uid()
  - Prevents re-evaluation of auth functions for each row
  - Significantly improves query performance at scale
  
  ## Tables Updated
  - notifications
  - business_cards
  - tasks
  - leads
  - profiles
  - discussion_posts
  - connections
*/

-- =====================================================
-- NOTIFICATIONS
-- =====================================================

DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

-- =====================================================
-- BUSINESS CARDS
-- =====================================================

DROP POLICY IF EXISTS "Admins can delete business cards" ON public.business_cards;
CREATE POLICY "Admins can delete business cards"
  ON public.business_cards FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = (select auth.uid()) AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can insert business cards" ON public.business_cards;
CREATE POLICY "Admins can insert business cards"
  ON public.business_cards FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = (select auth.uid()) AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can update any business card" ON public.business_cards;
CREATE POLICY "Admins can update any business card"
  ON public.business_cards FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = (select auth.uid()) AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Users can update their own card" ON public.business_cards;
CREATE POLICY "Users can update their own card"
  ON public.business_cards FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can view their own card" ON public.business_cards;
CREATE POLICY "Users can view their own card"
  ON public.business_cards FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

-- =====================================================
-- TASKS
-- =====================================================

DROP POLICY IF EXISTS "Users can create tasks" ON public.tasks;
CREATE POLICY "Users can create tasks"
  ON public.tasks FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Users can delete tasks they created" ON public.tasks;
CREATE POLICY "Users can delete tasks they created"
  ON public.tasks FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update tasks they created, are assigned to, or claime" ON public.tasks;
CREATE POLICY "Users can update tasks they created, are assigned to, or claime"
  ON public.tasks FOR UPDATE
  TO authenticated
  USING (
    user_id = (select auth.uid()) OR 
    assigned_to = (select auth.uid()) OR 
    claimed_by = (select auth.uid())
  );

DROP POLICY IF EXISTS "Users can view tasks they have access to" ON public.tasks;
CREATE POLICY "Users can view tasks they have access to"
  ON public.tasks FOR SELECT
  TO authenticated
  USING (
    user_id = (select auth.uid()) OR 
    assigned_to = (select auth.uid()) OR 
    claimed_by = (select auth.uid()) OR 
    assigned_to IS NULL
  );

-- =====================================================
-- LEADS
-- =====================================================

DROP POLICY IF EXISTS "Authenticated users can create leads" ON public.leads;
CREATE POLICY "Authenticated users can create leads"
  ON public.leads FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Sales reps see their leads and fishbowl, admins see all" ON public.leads;
CREATE POLICY "Sales reps see their leads and fishbowl, admins see all"
  ON public.leads FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = (select auth.uid()) 
      AND (role = 'admin' OR id = leads.assigned_to OR leads.assigned_to IS NULL)
    )
  );

DROP POLICY IF EXISTS "Users can delete their assigned leads, admins can delete any" ON public.leads;
CREATE POLICY "Users can delete their assigned leads, admins can delete any"
  ON public.leads FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = (select auth.uid()) 
      AND (role = 'admin' OR id = leads.assigned_to)
    )
  );

DROP POLICY IF EXISTS "Users can update leads assigned to them or admins can update an" ON public.leads;
CREATE POLICY "Users can update leads assigned to them or admins can update an"
  ON public.leads FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = (select auth.uid()) 
      AND (role = 'admin' OR id = leads.assigned_to OR leads.assigned_to IS NULL)
    )
  );

-- =====================================================
-- PROFILES
-- =====================================================

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can view other active profiles" ON public.profiles;
CREATE POLICY "Users can view other active profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (id = (select auth.uid()));

-- =====================================================
-- DISCUSSION POSTS
-- =====================================================

DROP POLICY IF EXISTS "Users can create discussion posts" ON public.discussion_posts;
CREATE POLICY "Users can create discussion posts"
  ON public.discussion_posts FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can delete own posts" ON public.discussion_posts;
CREATE POLICY "Users can delete own posts"
  ON public.discussion_posts FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own posts" ON public.discussion_posts;
CREATE POLICY "Users can update own posts"
  ON public.discussion_posts FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can view private posts they are part of" ON public.discussion_posts;
CREATE POLICY "Users can view private posts they are part of"
  ON public.discussion_posts FOR SELECT
  TO authenticated
  USING (
    NOT is_private OR 
    user_id = (select auth.uid()) OR 
    assigned_to = (select auth.uid()) OR 
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = (select auth.uid()) AND role = 'admin'
    )
  );

-- =====================================================
-- CONNECTIONS
-- =====================================================

DROP POLICY IF EXISTS "Admins can view all connections" ON public.connections;
CREATE POLICY "Admins can view all connections"
  ON public.connections FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = (select auth.uid()) AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Users can create their own connections" ON public.connections;
CREATE POLICY "Users can create their own connections"
  ON public.connections FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can delete their own connections" ON public.connections;
CREATE POLICY "Users can delete their own connections"
  ON public.connections FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update their own connections" ON public.connections;
CREATE POLICY "Users can update their own connections"
  ON public.connections FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can view their own connections" ON public.connections;
CREATE POLICY "Users can view their own connections"
  ON public.connections FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));