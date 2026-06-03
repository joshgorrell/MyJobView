/*
  # Fix User Deletion - Preserve Work Records

  ## Summary
  Ensures that when a user is deleted or deactivated, their work records (tasks, work orders, 
  proposals, etc.) are preserved and can be reassigned to another user.

  ## Changes Made

  1. **Fix CASCADE Foreign Keys**
     - Tasks, Connections, Business Cards, Commissions, PTO
     - Change from CASCADE to SET NULL to preserve records
  
  2. **Make Columns Nullable**
     - Remove NOT NULL constraints where needed

  ## Strategy
  - Keep CASCADE for truly personal data (notifications, likes, preferences)
  - Change to SET NULL for work records that need to be preserved
*/

-- Fix Tasks - preserve tasks when user deleted
DO $$
BEGIN
  ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_user_id_fkey;
  ALTER TABLE tasks ALTER COLUMN user_id DROP NOT NULL;
  ALTER TABLE tasks ADD CONSTRAINT tasks_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix Connections - preserve connection records
DO $$
BEGIN
  ALTER TABLE connections DROP CONSTRAINT IF EXISTS connections_user_id_fkey;
  ALTER TABLE connections ALTER COLUMN user_id DROP NOT NULL;
  ALTER TABLE connections ADD CONSTRAINT connections_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix Business Cards - preserve business card records
DO $$
BEGIN
  ALTER TABLE business_cards DROP CONSTRAINT IF EXISTS business_cards_user_id_fkey;
  ALTER TABLE business_cards ALTER COLUMN user_id DROP NOT NULL;
  ALTER TABLE business_cards ADD CONSTRAINT business_cards_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix Commission Records - preserve commission history
DO $$
BEGIN
  ALTER TABLE commission_records DROP CONSTRAINT IF EXISTS commission_records_employee_id_fkey;
  ALTER TABLE commission_records ALTER COLUMN employee_id DROP NOT NULL;
  ALTER TABLE commission_records ADD CONSTRAINT commission_records_employee_id_fkey
    FOREIGN KEY (employee_id) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix Employee Commission Config - preserve configuration
DO $$
BEGIN
  ALTER TABLE employee_commission_config DROP CONSTRAINT IF EXISTS employee_commission_config_employee_id_fkey;
  ALTER TABLE employee_commission_config ALTER COLUMN employee_id DROP NOT NULL;
  ALTER TABLE employee_commission_config ADD CONSTRAINT employee_commission_config_employee_id_fkey
    FOREIGN KEY (employee_id) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix PTO Balances - preserve PTO records
DO $$
BEGIN
  ALTER TABLE pto_balances DROP CONSTRAINT IF EXISTS pto_balances_employee_id_fkey;
  ALTER TABLE pto_balances ALTER COLUMN employee_id DROP NOT NULL;
  ALTER TABLE pto_balances ADD CONSTRAINT pto_balances_employee_id_fkey
    FOREIGN KEY (employee_id) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix PTO Requests - preserve PTO request history
DO $$
BEGIN
  ALTER TABLE pto_requests DROP CONSTRAINT IF EXISTS pto_requests_employee_id_fkey;
  ALTER TABLE pto_requests ALTER COLUMN employee_id DROP NOT NULL;
  ALTER TABLE pto_requests ADD CONSTRAINT pto_requests_employee_id_fkey
    FOREIGN KEY (employee_id) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix PTO Accrual History - preserve accrual history
DO $$
BEGIN
  ALTER TABLE pto_accrual_history DROP CONSTRAINT IF EXISTS pto_accrual_history_employee_id_fkey;
  ALTER TABLE pto_accrual_history ALTER COLUMN employee_id DROP NOT NULL;
  ALTER TABLE pto_accrual_history ADD CONSTRAINT pto_accrual_history_employee_id_fkey
    FOREIGN KEY (employee_id) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix Discussion Posts - preserve discussion posts
DO $$
BEGIN
  ALTER TABLE discussion_posts DROP CONSTRAINT IF EXISTS discussion_posts_user_id_fkey;
  ALTER TABLE discussion_posts ALTER COLUMN user_id DROP NOT NULL;
  ALTER TABLE discussion_posts ADD CONSTRAINT discussion_posts_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix Feature Suggestions - preserve feature suggestions
DO $$
BEGIN
  ALTER TABLE feature_suggestions DROP CONSTRAINT IF EXISTS feature_suggestions_user_id_fkey;
  ALTER TABLE feature_suggestions ALTER COLUMN user_id DROP NOT NULL;
  ALTER TABLE feature_suggestions ADD CONSTRAINT feature_suggestions_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix Push Subscriptions - preserve push subscription records
DO $$
BEGIN
  ALTER TABLE push_subscriptions DROP CONSTRAINT IF EXISTS push_subscriptions_user_id_fkey;
  ALTER TABLE push_subscriptions ALTER COLUMN user_id DROP NOT NULL;
  ALTER TABLE push_subscriptions ADD CONSTRAINT push_subscriptions_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix User Offices - preserve office assignments
DO $$
BEGIN
  ALTER TABLE user_offices DROP CONSTRAINT IF EXISTS user_offices_user_id_fkey;
  ALTER TABLE user_offices ALTER COLUMN user_id DROP NOT NULL;
  ALTER TABLE user_offices ADD CONSTRAINT user_offices_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix Task Comments - preserve task comments
DO $$
BEGIN
  ALTER TABLE task_comments DROP CONSTRAINT IF EXISTS task_comments_user_id_fkey;
  ALTER TABLE task_comments ALTER COLUMN user_id DROP NOT NULL;
  ALTER TABLE task_comments ADD CONSTRAINT task_comments_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix Task Mentions - preserve task mentions
DO $$
BEGIN
  ALTER TABLE task_mentions DROP CONSTRAINT IF EXISTS task_mentions_mentioning_user_id_fkey;
  ALTER TABLE task_mentions ALTER COLUMN mentioning_user_id DROP NOT NULL;
  ALTER TABLE task_mentions ADD CONSTRAINT task_mentions_mentioning_user_id_fkey
    FOREIGN KEY (mentioning_user_id) REFERENCES profiles(id) ON DELETE SET NULL;

  ALTER TABLE task_mentions DROP CONSTRAINT IF EXISTS task_mentions_mentioned_user_id_fkey;
  ALTER TABLE task_mentions ALTER COLUMN mentioned_user_id DROP NOT NULL;
  ALTER TABLE task_mentions ADD CONSTRAINT task_mentions_mentioned_user_id_fkey
    FOREIGN KEY (mentioned_user_id) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix Task Watchers - preserve task watchers
DO $$
BEGIN
  ALTER TABLE task_watchers DROP CONSTRAINT IF EXISTS task_watchers_user_id_fkey;
  ALTER TABLE task_watchers ALTER COLUMN user_id DROP NOT NULL;
  ALTER TABLE task_watchers ADD CONSTRAINT task_watchers_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix Sticky Notes - preserve sticky notes
DO $$
BEGIN
  ALTER TABLE sticky_notes DROP CONSTRAINT IF EXISTS sticky_notes_user_id_fkey;
  ALTER TABLE sticky_notes ALTER COLUMN user_id DROP NOT NULL;
  ALTER TABLE sticky_notes ADD CONSTRAINT sticky_notes_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix User Column Preferences - preserve column preferences
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'user_column_preferences'
  ) THEN
    ALTER TABLE user_column_preferences DROP CONSTRAINT IF EXISTS user_column_preferences_user_id_fkey;
    ALTER TABLE user_column_preferences ALTER COLUMN user_id DROP NOT NULL;
    ALTER TABLE user_column_preferences ADD CONSTRAINT user_column_preferences_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Fix Department Access - preserve department access records
DO $$
BEGIN
  ALTER TABLE department_access DROP CONSTRAINT IF EXISTS department_access_user_id_fkey;
  ALTER TABLE department_access ALTER COLUMN user_id DROP NOT NULL;
  ALTER TABLE department_access ADD CONSTRAINT department_access_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix Module Access - preserve module access records
DO $$
BEGIN
  ALTER TABLE module_access DROP CONSTRAINT IF EXISTS module_access_user_id_fkey;
  ALTER TABLE module_access ALTER COLUMN user_id DROP NOT NULL;
  ALTER TABLE module_access ADD CONSTRAINT module_access_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix Technician Status - preserve technician status
DO $$
BEGIN
  ALTER TABLE technician_status DROP CONSTRAINT IF EXISTS technician_status_technician_id_fkey;
  ALTER TABLE technician_status ALTER COLUMN technician_id DROP NOT NULL;
  ALTER TABLE technician_status ADD CONSTRAINT technician_status_technician_id_fkey
    FOREIGN KEY (technician_id) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix Technician Locations - preserve location history
DO $$
BEGIN
  ALTER TABLE technician_locations DROP CONSTRAINT IF EXISTS technician_locations_technician_id_fkey;
  ALTER TABLE technician_locations ALTER COLUMN technician_id DROP NOT NULL;
  ALTER TABLE technician_locations ADD CONSTRAINT technician_locations_technician_id_fkey
    FOREIGN KEY (technician_id) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix Tech Locations (ETA system) - preserve location data
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'tech_locations'
  ) THEN
    ALTER TABLE tech_locations DROP CONSTRAINT IF EXISTS tech_locations_technician_id_fkey;
    ALTER TABLE tech_locations ALTER COLUMN technician_id DROP NOT NULL;
    ALTER TABLE tech_locations ADD CONSTRAINT tech_locations_technician_id_fkey
      FOREIGN KEY (technician_id) REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Fix Travel Logs - preserve travel history
DO $$
BEGIN
  ALTER TABLE travel_logs DROP CONSTRAINT IF EXISTS travel_logs_technician_id_fkey;
  ALTER TABLE travel_logs ALTER COLUMN technician_id DROP NOT NULL;
  ALTER TABLE travel_logs ADD CONSTRAINT travel_logs_technician_id_fkey
    FOREIGN KEY (technician_id) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix Time Entries - preserve time entry records
DO $$
BEGIN
  ALTER TABLE time_entries DROP CONSTRAINT IF EXISTS time_entries_technician_id_fkey;
  ALTER TABLE time_entries ALTER COLUMN technician_id DROP NOT NULL;
  ALTER TABLE time_entries ADD CONSTRAINT time_entries_technician_id_fkey
    FOREIGN KEY (technician_id) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix Technician Skills - preserve skill records
DO $$
BEGIN
  ALTER TABLE technician_skills DROP CONSTRAINT IF EXISTS technician_skills_technician_id_fkey;
  ALTER TABLE technician_skills ALTER COLUMN technician_id DROP NOT NULL;
  ALTER TABLE technician_skills ADD CONSTRAINT technician_skills_technician_id_fkey
    FOREIGN KEY (technician_id) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix Calendar Members - preserve calendar memberships
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'calendar_members'
  ) THEN
    ALTER TABLE calendar_members DROP CONSTRAINT IF EXISTS calendar_members_user_id_fkey;
    ALTER TABLE calendar_members ALTER COLUMN user_id DROP NOT NULL;
    ALTER TABLE calendar_members ADD CONSTRAINT calendar_members_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Fix User Visibility Settings - preserve visibility settings
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'user_visibility_settings'
  ) THEN
    ALTER TABLE user_visibility_settings DROP CONSTRAINT IF EXISTS user_visibility_settings_user_id_fkey;
    ALTER TABLE user_visibility_settings ALTER COLUMN user_id DROP NOT NULL;
    ALTER TABLE user_visibility_settings ADD CONSTRAINT user_visibility_settings_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Fix additional foreign keys that were NO ACTION (blocking deletion)
DO $$
BEGIN
  ALTER TABLE discussion_posts DROP CONSTRAINT IF EXISTS discussion_posts_assigned_to_fkey;
  ALTER TABLE discussion_posts ADD CONSTRAINT discussion_posts_assigned_to_fkey
    FOREIGN KEY (assigned_to) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE discussion_posts DROP CONSTRAINT IF EXISTS discussion_posts_completed_by_fkey;
  ALTER TABLE discussion_posts ADD CONSTRAINT discussion_posts_completed_by_fkey
    FOREIGN KEY (completed_by) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE discussion_posts DROP CONSTRAINT IF EXISTS discussion_posts_last_bumped_by_fkey;
  ALTER TABLE discussion_posts ADD CONSTRAINT discussion_posts_last_bumped_by_fkey
    FOREIGN KEY (last_bumped_by) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_assigned_to_fkey;
  ALTER TABLE contacts ADD CONSTRAINT contacts_assigned_to_fkey
    FOREIGN KEY (assigned_to) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE recurring_subscriptions DROP CONSTRAINT IF EXISTS recurring_subscriptions_created_by_fkey;
  ALTER TABLE recurring_subscriptions ADD CONSTRAINT recurring_subscriptions_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE punchlist_tasks DROP CONSTRAINT IF EXISTS punchlist_tasks_completed_by_fkey;
  ALTER TABLE punchlist_tasks ADD CONSTRAINT punchlist_tasks_completed_by_fkey
    FOREIGN KEY (completed_by) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Create indexes for finding orphaned records
CREATE INDEX IF NOT EXISTS idx_tasks_orphaned ON tasks(user_id) WHERE user_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_work_orders_orphaned_assigned ON work_orders(assigned_to) WHERE assigned_to IS NULL;
CREATE INDEX IF NOT EXISTS idx_work_orders_orphaned_created ON work_orders(created_by) WHERE created_by IS NULL;
CREATE INDEX IF NOT EXISTS idx_proposals_orphaned ON proposals(created_by) WHERE created_by IS NULL;
CREATE INDEX IF NOT EXISTS idx_projects_orphaned ON projects(created_by) WHERE created_by IS NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_orphaned ON invoices(created_by) WHERE created_by IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_orphaned_assigned ON leads(assigned_to) WHERE assigned_to IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_orphaned_created ON leads(created_by) WHERE created_by IS NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_orphaned ON contacts(assigned_to) WHERE assigned_to IS NULL;
