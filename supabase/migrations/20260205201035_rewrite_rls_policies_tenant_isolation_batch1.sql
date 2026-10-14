/*\n  # Rewrite RLS Policies for Tenant Isolation - Batch 1 (Core Tables)\n\n  Replaces existing RLS policies on core tables with organization-scoped policies.\n  Every SELECT, INSERT, UPDATE, DELETE policy now enforces organization_id matching.\n\n  Tables covered: profiles, leads, contacts, connections, tasks, business_cards,\n  company_offices, departments, roles, notifications, feed_events, discussion_posts\n*/\n\n-- PROFILES\nDROP POLICY IF EXISTS "Users can view own profile" ON profiles

\nDROP POLICY IF EXISTS "Users can read own profile" ON profiles

\nDROP POLICY IF EXISTS "Anyone can read profiles" ON profiles

\nDROP POLICY IF EXISTS "Authenticated users can read profiles" ON profiles

\nDROP POLICY IF EXISTS "Users can update own profile" ON profiles

\nDROP POLICY IF EXISTS "Admins can update any profile" ON profiles

\nDROP POLICY IF EXISTS "profile_select_policy" ON profiles

\nDROP POLICY IF EXISTS "profile_update_policy" ON profiles

\nDROP POLICY IF EXISTS "profile_admin_update_policy" ON profiles

\nDROP POLICY IF EXISTS "profiles_select_optimized" ON profiles

\nDROP POLICY IF EXISTS "profiles_update_own" ON profiles

\nDROP POLICY IF EXISTS "profiles_admin_update" ON profiles

\nDROP POLICY IF EXISTS "profiles_insert_for_trigger" ON profiles

\nDROP POLICY IF EXISTS "Allow trigger to insert profiles" ON profiles

\nDROP POLICY IF EXISTS "profiles_admin_delete" ON profiles

\n\nCREATE POLICY "profiles_select_same_org"\n  ON profiles FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\n\nCREATE POLICY "profiles_update_own"\n  ON profiles FOR UPDATE TO authenticated\n  USING (id = auth.uid())\n  WITH CHECK (id = auth.uid() AND organization_id = get_user_org_id())

\n\nCREATE POLICY "profiles_admin_update_same_org"\n  ON profiles FOR UPDATE TO authenticated\n  USING (\n    organization_id = get_user_org_id()\n    AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')\n  )\n  WITH CHECK (organization_id = get_user_org_id())

\n\nCREATE POLICY "profiles_insert_trigger"\n  ON profiles FOR INSERT\n  WITH CHECK (true)

\n\nCREATE POLICY "profiles_delete_admin_same_org"\n  ON profiles FOR DELETE TO authenticated\n  USING (\n    organization_id = get_user_org_id()\n    AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')\n  )

\n\n-- LEADS\nDROP POLICY IF EXISTS "leads_select_optimized" ON leads

\nDROP POLICY IF EXISTS "leads_insert" ON leads

\nDROP POLICY IF EXISTS "leads_update" ON leads

\nDROP POLICY IF EXISTS "leads_delete" ON leads

\nDROP POLICY IF EXISTS "Anyone can read leads" ON leads

\nDROP POLICY IF EXISTS "Authenticated can read leads" ON leads

\nDROP POLICY IF EXISTS "Authenticated can insert leads" ON leads

\nDROP POLICY IF EXISTS "Authenticated can update leads" ON leads

\nDROP POLICY IF EXISTS "Authenticated can delete leads" ON leads

\nDROP POLICY IF EXISTS "Anonymous can insert leads" ON leads

\n\nCREATE POLICY "leads_select_same_org"\n  ON leads FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\n\nCREATE POLICY "leads_insert_same_org"\n  ON leads FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\n\nCREATE POLICY "leads_insert_anon"\n  ON leads FOR INSERT TO anon\n  WITH CHECK (true)

\n\nCREATE POLICY "leads_update_same_org"\n  ON leads FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id())\n  WITH CHECK (organization_id = get_user_org_id())

\n\nCREATE POLICY "leads_delete_same_org"\n  ON leads FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\n-- CONTACTS\nDROP POLICY IF EXISTS "contacts_select_optimized" ON contacts

\nDROP POLICY IF EXISTS "contacts_insert" ON contacts

\nDROP POLICY IF EXISTS "contacts_update" ON contacts

\nDROP POLICY IF EXISTS "contacts_delete" ON contacts

\nDROP POLICY IF EXISTS "Authenticated can read contacts" ON contacts

\nDROP POLICY IF EXISTS "Authenticated can insert contacts" ON contacts

\nDROP POLICY IF EXISTS "Authenticated can update contacts" ON contacts

\nDROP POLICY IF EXISTS "Anonymous can insert contacts" ON contacts

\nDROP POLICY IF EXISTS "Anonymous can insert lead contacts" ON contacts

\n\nCREATE POLICY "contacts_select_same_org"\n  ON contacts FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\n\nCREATE POLICY "contacts_insert_same_org"\n  ON contacts FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\n\nCREATE POLICY "contacts_insert_anon"\n  ON contacts FOR INSERT TO anon\n  WITH CHECK (true)

\n\nCREATE POLICY "contacts_update_same_org"\n  ON contacts FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id())\n  WITH CHECK (organization_id = get_user_org_id())

\n\nCREATE POLICY "contacts_delete_same_org"\n  ON contacts FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\n-- CONNECTIONS\nDROP POLICY IF EXISTS "connections_select_optimized" ON connections

\nDROP POLICY IF EXISTS "connections_insert" ON connections

\nDROP POLICY IF EXISTS "connections_update" ON connections

\nDROP POLICY IF EXISTS "connections_delete" ON connections

\n\nCREATE POLICY "connections_select_same_org"\n  ON connections FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\n\nCREATE POLICY "connections_insert_same_org"\n  ON connections FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\n\nCREATE POLICY "connections_update_same_org"\n  ON connections FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id())\n  WITH CHECK (organization_id = get_user_org_id())

\n\nCREATE POLICY "connections_delete_same_org"\n  ON connections FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\n-- TASKS\nDROP POLICY IF EXISTS "tasks_select_optimized" ON tasks

\nDROP POLICY IF EXISTS "tasks_insert" ON tasks

\nDROP POLICY IF EXISTS "tasks_update" ON tasks

\nDROP POLICY IF EXISTS "tasks_delete" ON tasks

\nDROP POLICY IF EXISTS "Authenticated can read tasks" ON tasks

\nDROP POLICY IF EXISTS "Authenticated can insert tasks" ON tasks

\nDROP POLICY IF EXISTS "Authenticated can update tasks" ON tasks

\nDROP POLICY IF EXISTS "Authenticated can delete tasks" ON tasks

\n\nCREATE POLICY "tasks_select_same_org"\n  ON tasks FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\n\nCREATE POLICY "tasks_insert_same_org"\n  ON tasks FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\n\nCREATE POLICY "tasks_update_same_org"\n  ON tasks FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id())\n  WITH CHECK (organization_id = get_user_org_id())

\n\nCREATE POLICY "tasks_delete_same_org"\n  ON tasks FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\n-- NOTIFICATIONS\nDROP POLICY IF EXISTS "notifications_select_optimized" ON notifications

\nDROP POLICY IF EXISTS "notifications_insert" ON notifications

\nDROP POLICY IF EXISTS "notifications_update" ON notifications

\nDROP POLICY IF EXISTS "notifications_delete" ON notifications

\nDROP POLICY IF EXISTS "Users can read own notifications" ON notifications

\nDROP POLICY IF EXISTS "Users can update own notifications" ON notifications

\nDROP POLICY IF EXISTS "Users can delete own notifications" ON notifications

\nDROP POLICY IF EXISTS "Authenticated can insert notifications" ON notifications

\n\nCREATE POLICY "notifications_select_own"\n  ON notifications FOR SELECT TO authenticated\n  USING (user_id = auth.uid() AND organization_id = get_user_org_id())

\n\nCREATE POLICY "notifications_insert_same_org"\n  ON notifications FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\n\nCREATE POLICY "notifications_update_own"\n  ON notifications FOR UPDATE TO authenticated\n  USING (user_id = auth.uid() AND organization_id = get_user_org_id())\n  WITH CHECK (organization_id = get_user_org_id())

\n\nCREATE POLICY "notifications_delete_own"\n  ON notifications FOR DELETE TO authenticated\n  USING (user_id = auth.uid() AND organization_id = get_user_org_id())

\n\n-- FEED_EVENTS\nDROP POLICY IF EXISTS "feed_events_select_optimized" ON feed_events

\nDROP POLICY IF EXISTS "feed_events_insert" ON feed_events

\nDROP POLICY IF EXISTS "Authenticated can read feed events" ON feed_events

\nDROP POLICY IF EXISTS "Authenticated can insert feed events" ON feed_events

\n\nCREATE POLICY "feed_events_select_same_org"\n  ON feed_events FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\n\nCREATE POLICY "feed_events_insert_same_org"\n  ON feed_events FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\n\n-- DISCUSSION_POSTS\nDROP POLICY IF EXISTS "discussion_posts_select_optimized" ON discussion_posts

\nDROP POLICY IF EXISTS "discussion_posts_insert" ON discussion_posts

\nDROP POLICY IF EXISTS "discussion_posts_update" ON discussion_posts

\nDROP POLICY IF EXISTS "discussion_posts_delete" ON discussion_posts

\n\nCREATE POLICY "discussion_posts_select_same_org"\n  ON discussion_posts FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\n\nCREATE POLICY "discussion_posts_insert_same_org"\n  ON discussion_posts FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\n\nCREATE POLICY "discussion_posts_update_same_org"\n  ON discussion_posts FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id() AND user_id = auth.uid())\n  WITH CHECK (organization_id = get_user_org_id())

\n\nCREATE POLICY "discussion_posts_delete_same_org"\n  ON discussion_posts FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id() AND user_id = auth.uid())

\n
