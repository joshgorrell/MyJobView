/*
  # Update RLS Policies for Office Visibility
  
  ## Summary
  Updates RLS policies on key tables to respect office visibility settings.
  Uses the user_can_view_record() helper function.
  
  ## Tables Updated
  - proposals
  - projects
  - invoices
  - leads
  - contacts
  - tasks
  - discussion_posts
*/

-- ============================================================
-- PROPOSALS
-- ============================================================

DROP POLICY IF EXISTS "Users can view company proposals" ON proposals;

CREATE POLICY "Users can view proposals based on office visibility"
  ON proposals FOR SELECT
  TO authenticated
  USING (
    user_can_view_record(office_id, created_by)
  );

-- ============================================================
-- PROJECTS
-- ============================================================

DROP POLICY IF EXISTS "Users can view company projects" ON projects;

CREATE POLICY "Users can view projects based on office visibility"
  ON projects FOR SELECT
  TO authenticated
  USING (
    user_can_view_record(office_id, created_by)
  );

-- ============================================================
-- INVOICES
-- ============================================================

DROP POLICY IF EXISTS "Users can view company invoices" ON invoices;

CREATE POLICY "Users can view invoices based on office visibility"
  ON invoices FOR SELECT
  TO authenticated
  USING (
    user_can_view_record(office_id, created_by)
  );

-- ============================================================
-- LEADS
-- ============================================================

DROP POLICY IF EXISTS "Users can view leads" ON leads;
DROP POLICY IF EXISTS "Users can view company leads" ON leads;
DROP POLICY IF EXISTS "Sales reps can view leads" ON leads;

CREATE POLICY "Users can view leads based on office visibility"
  ON leads FOR SELECT
  TO authenticated
  USING (
    user_can_view_record(office_id, created_by)
  );

-- ============================================================
-- CONTACTS
-- ============================================================

DROP POLICY IF EXISTS "Users can view contacts" ON contacts;
DROP POLICY IF EXISTS "Users can view company contacts" ON contacts;

CREATE POLICY "Users can view contacts based on office visibility"
  ON contacts FOR SELECT
  TO authenticated
  USING (
    user_can_view_record(office_id, assigned_to)
    OR created_by = auth.uid()
  );

-- ============================================================
-- TASKS
-- ============================================================

DROP POLICY IF EXISTS "Users can view tasks" ON tasks;
DROP POLICY IF EXISTS "Users can view company tasks" ON tasks;

CREATE POLICY "Users can view tasks based on office visibility"
  ON tasks FOR SELECT
  TO authenticated
  USING (
    assigned_to = auth.uid()
    OR (lead_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM leads
      WHERE leads.id = tasks.lead_id
      AND user_can_view_record(leads.office_id, leads.created_by)
    ))
    OR (contact_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM contacts
      WHERE contacts.id = tasks.contact_id
      AND user_can_view_record(contacts.office_id, contacts.assigned_to)
    ))
  );

-- ============================================================
-- DISCUSSION POSTS
-- ============================================================

DROP POLICY IF EXISTS "Users can view discussion posts" ON discussion_posts;

CREATE POLICY "Users can view discussion posts based on visibility"
  ON discussion_posts FOR SELECT
  TO authenticated
  USING (
    is_private = false
    OR (is_private = true AND user_can_view_record(
      (SELECT primary_office_id FROM profiles WHERE id = discussion_posts.user_id),
      discussion_posts.user_id
    ))
  );
