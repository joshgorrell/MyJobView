/*
  # Optimize RLS Policies - Batch 1: Use Stable Auth Functions
  
  1. Performance Issue
    - 62+ RLS policies call auth.uid() directly in USING/WITH CHECK clauses
    - auth.uid() is re-evaluated for every single row returned
    - This causes severe performance degradation on large result sets
  
  2. Solution
    - Replace auth.uid() calls with auth_uid() stable function
    - Replace role checks with is_admin() helper function
    - Stable functions are evaluated once per query, not per row
    - Expected performance improvement: 10-100x on large result sets
  
  3. Tables Covered - Batch 1
    - profiles (high traffic, frequently queried)
    - discussion_posts
    - messages
    - task_comments
    - user_starred_modules
    - user_column_preferences
    - push_subscriptions
    - time_entry_import_profiles
    - time_entry_import_history
*/

-- Profiles: Update own profile policy
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE
  TO authenticated
  USING (id = auth_uid())
  WITH CHECK (id = auth_uid() AND organization_id = get_user_org_id());

-- Profiles: Admin update policy  
DROP POLICY IF EXISTS "profiles_admin_update_same_org" ON profiles;
CREATE POLICY "profiles_admin_update_same_org"
  ON profiles FOR UPDATE
  TO authenticated
  USING (organization_id = get_user_org_id() AND is_admin())
  WITH CHECK (organization_id = get_user_org_id());

-- Discussion posts: Update policy
DROP POLICY IF EXISTS "discussion_posts_update_same_org" ON discussion_posts;
CREATE POLICY "discussion_posts_update_same_org"
  ON discussion_posts FOR UPDATE
  TO authenticated
  USING (organization_id = get_user_org_id() AND user_id = auth_uid())
  WITH CHECK (organization_id = get_user_org_id());

-- Messages: Update policy
DROP POLICY IF EXISTS "messages_update_same_org" ON messages;
CREATE POLICY "messages_update_same_org"
  ON messages FOR UPDATE
  TO authenticated
  USING (organization_id = get_user_org_id() AND author_id = auth_uid())
  WITH CHECK (organization_id = get_user_org_id());

-- Task comments: Update policy
DROP POLICY IF EXISTS "task_comments_update_same_org" ON task_comments;
CREATE POLICY "task_comments_update_same_org"
  ON task_comments FOR UPDATE
  TO authenticated
  USING (organization_id = get_user_org_id() AND user_id = auth_uid())
  WITH CHECK (organization_id = get_user_org_id());

-- User starred modules: Update policy
DROP POLICY IF EXISTS "user_starred_modules_update_same_org" ON user_starred_modules;
CREATE POLICY "user_starred_modules_update_same_org"
  ON user_starred_modules FOR UPDATE
  TO authenticated
  USING (organization_id = get_user_org_id() AND user_id = auth_uid())
  WITH CHECK (organization_id = get_user_org_id());

-- User column preferences: Update policy
DROP POLICY IF EXISTS "user_column_preferences_update_same_org" ON user_column_preferences;
CREATE POLICY "user_column_preferences_update_same_org"
  ON user_column_preferences FOR UPDATE
  TO authenticated
  USING (organization_id = get_user_org_id() AND user_id = auth_uid())
  WITH CHECK (organization_id = get_user_org_id());

-- Push subscriptions: Update policy
DROP POLICY IF EXISTS "push_subscriptions_update_same_org" ON push_subscriptions;
CREATE POLICY "push_subscriptions_update_same_org"
  ON push_subscriptions FOR UPDATE
  TO authenticated
  USING (organization_id = get_user_org_id() AND user_id = auth_uid())
  WITH CHECK (organization_id = get_user_org_id());

-- Time entry import profiles: Update policy
DROP POLICY IF EXISTS "Users can update own profiles" ON time_entry_import_profiles;
CREATE POLICY "Users can update own profiles"
  ON time_entry_import_profiles FOR UPDATE
  TO authenticated
  USING (created_by = auth_uid())
  WITH CHECK (created_by = auth_uid());

-- Time entry import history: Update policy
DROP POLICY IF EXISTS "Users can update own import history" ON time_entry_import_history;
CREATE POLICY "Users can update own import history"
  ON time_entry_import_history FOR UPDATE
  TO authenticated
  USING (imported_by = auth_uid() OR is_admin())
  WITH CHECK (imported_by = auth_uid() OR is_admin());