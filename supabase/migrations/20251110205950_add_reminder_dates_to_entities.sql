/*
  # Add Reminder Date Fields

  ## Changes
  1. Add reminder_date and calendar_event_id fields to:
    - leads table
    - tasks table
    - discussion_posts table

  ## Purpose
  - Allow users to set follow-up/reminder dates for leads, tasks, and discussions
  - Track Google Calendar event IDs for created reminders
  - Enable automatic calendar event creation
  
  ## Security
  - No RLS changes needed - existing policies cover these fields
  - Users can only set reminders for items they have access to
*/

-- Add reminder fields to leads table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'reminder_date'
  ) THEN
    ALTER TABLE leads ADD COLUMN reminder_date timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'google_calendar_event_id'
  ) THEN
    ALTER TABLE leads ADD COLUMN google_calendar_event_id text;
  END IF;
END $$;

-- Add reminder fields to tasks table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'reminder_date'
  ) THEN
    ALTER TABLE tasks ADD COLUMN reminder_date timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'google_calendar_event_id'
  ) THEN
    ALTER TABLE tasks ADD COLUMN google_calendar_event_id text;
  END IF;
END $$;

-- Add reminder fields to discussion_posts table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'discussion_posts' AND column_name = 'reminder_date'
  ) THEN
    ALTER TABLE discussion_posts ADD COLUMN reminder_date timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'discussion_posts' AND column_name = 'google_calendar_event_id'
  ) THEN
    ALTER TABLE discussion_posts ADD COLUMN google_calendar_event_id text;
  END IF;
END $$;

-- Create indexes for querying by reminder date
CREATE INDEX IF NOT EXISTS idx_leads_reminder_date ON leads(reminder_date) WHERE reminder_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_reminder_date ON tasks(reminder_date) WHERE reminder_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_discussion_posts_reminder_date ON discussion_posts(reminder_date) WHERE reminder_date IS NOT NULL;