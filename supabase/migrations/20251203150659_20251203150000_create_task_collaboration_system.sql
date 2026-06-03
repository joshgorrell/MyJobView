/*
  # Create Task Collaboration System

  1. New Tables
    - `task_comments`
      - `id` (uuid, primary key)
      - `task_id` (uuid, references tasks) - Which task the comment is on
      - `user_id` (uuid, references profiles) - Who made the comment
      - `content` (text) - The comment text
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `task_watchers`
      - `id` (uuid, primary key)
      - `task_id` (uuid, references tasks) - Which task is being watched
      - `user_id` (uuid, references profiles) - Who is watching
      - `created_at` (timestamptz)
      - Unique constraint on (task_id, user_id)

    - `task_mentions`
      - `id` (uuid, primary key)
      - `task_id` (uuid, references tasks) - Which task
      - `comment_id` (uuid, references task_comments, nullable) - Which comment (null for task description mentions)
      - `mentioned_user_id` (uuid, references profiles) - Who was mentioned
      - `mentioning_user_id` (uuid, references profiles) - Who did the mentioning
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Users can view comments/watchers for tasks they can access
    - Users can create comments on tasks they can access
    - Users can add/remove themselves as watchers
    - Automatic watcher addition for task creators, assignees, and mentioners

  3. Triggers
    - Automatically add task creator as watcher
    - Automatically add assigned user as watcher
    - Automatically add mentioned users as watchers
    - Create notifications for new comments to all watchers
    - Create notifications for @mentions
*/

-- Create task_comments table
CREATE TABLE IF NOT EXISTS task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create task_watchers table
CREATE TABLE IF NOT EXISTS task_watchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(task_id, user_id)
);

-- Create task_mentions table
CREATE TABLE IF NOT EXISTS task_mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  comment_id uuid REFERENCES task_comments(id) ON DELETE CASCADE,
  mentioned_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  mentioning_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_task_comments_task_id ON task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_user_id ON task_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_created_at ON task_comments(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_task_watchers_task_id ON task_watchers(task_id);
CREATE INDEX IF NOT EXISTS idx_task_watchers_user_id ON task_watchers(user_id);

CREATE INDEX IF NOT EXISTS idx_task_mentions_task_id ON task_mentions(task_id);
CREATE INDEX IF NOT EXISTS idx_task_mentions_mentioned_user_id ON task_mentions(mentioned_user_id);
CREATE INDEX IF NOT EXISTS idx_task_mentions_comment_id ON task_mentions(comment_id);

-- Enable RLS
ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_watchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_mentions ENABLE ROW LEVEL SECURITY;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON task_comments TO authenticated;
GRANT SELECT, INSERT, DELETE ON task_watchers TO authenticated;
GRANT SELECT, INSERT ON task_mentions TO authenticated;

-- RLS Policies for task_comments
CREATE POLICY "Users can view comments on tasks they can access"
  ON task_comments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_comments.task_id
      AND (
        t.user_id = auth.uid()
        OR t.assigned_to = auth.uid()
        OR EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.id = auth.uid()
          AND p.role IN ('admin', 'manager')
        )
        OR EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.id = auth.uid()
          AND p.can_view_all_tasks = true
        )
      )
    )
  );

CREATE POLICY "Users can create comments on tasks they can access"
  ON task_comments FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_comments.task_id
      AND (
        t.user_id = auth.uid()
        OR t.assigned_to = auth.uid()
        OR EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.id = auth.uid()
          AND p.role IN ('admin', 'manager')
        )
        OR EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.id = auth.uid()
          AND p.can_view_all_tasks = true
        )
      )
    )
  );

CREATE POLICY "Users can update their own comments"
  ON task_comments FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own comments"
  ON task_comments FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- RLS Policies for task_watchers
CREATE POLICY "Users can view watchers on tasks they can access"
  ON task_watchers FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_watchers.task_id
      AND (
        t.user_id = auth.uid()
        OR t.assigned_to = auth.uid()
        OR EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.id = auth.uid()
          AND p.role IN ('admin', 'manager')
        )
        OR EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.id = auth.uid()
          AND p.can_view_all_tasks = true
        )
      )
    )
  );

CREATE POLICY "Users can add themselves as watchers"
  ON task_watchers FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_watchers.task_id
      AND (
        t.user_id = auth.uid()
        OR t.assigned_to = auth.uid()
        OR EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.id = auth.uid()
          AND p.role IN ('admin', 'manager')
        )
        OR EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.id = auth.uid()
          AND p.can_view_all_tasks = true
        )
      )
    )
  );

CREATE POLICY "Users can remove themselves as watchers"
  ON task_watchers FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- RLS Policies for task_mentions
CREATE POLICY "Users can view mentions for tasks they can access"
  ON task_mentions FOR SELECT
  TO authenticated
  USING (
    mentioned_user_id = auth.uid()
    OR mentioning_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_mentions.task_id
      AND (
        t.user_id = auth.uid()
        OR t.assigned_to = auth.uid()
        OR EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.id = auth.uid()
          AND p.role IN ('admin', 'manager')
        )
      )
    )
  );

CREATE POLICY "Users can create mentions"
  ON task_mentions FOR INSERT
  TO authenticated
  WITH CHECK (mentioning_user_id = auth.uid());

-- Function to automatically add task creator as watcher
CREATE OR REPLACE FUNCTION auto_watch_created_task()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Add task creator as watcher
  INSERT INTO task_watchers (task_id, user_id)
  VALUES (NEW.id, NEW.user_id)
  ON CONFLICT (task_id, user_id) DO NOTHING;

  -- If task is assigned, add assignee as watcher
  IF NEW.assigned_to IS NOT NULL THEN
    INSERT INTO task_watchers (task_id, user_id)
    VALUES (NEW.id, NEW.assigned_to)
    ON CONFLICT (task_id, user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Function to add assigned user as watcher when task is updated
CREATE OR REPLACE FUNCTION auto_watch_assigned_task()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL AND (OLD.assigned_to IS NULL OR NEW.assigned_to != OLD.assigned_to) THEN
    INSERT INTO task_watchers (task_id, user_id)
    VALUES (NEW.id, NEW.assigned_to)
    ON CONFLICT (task_id, user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Function to process @mentions and create notifications
CREATE OR REPLACE FUNCTION process_task_comment_mentions()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  mentioned_username text;
  mentioned_user_id uuid;
  task_title text;
BEGIN
  -- Get task title for notification
  SELECT title INTO task_title FROM tasks WHERE id = NEW.task_id;

  -- Extract all @mentions from the comment
  FOR mentioned_username IN
    SELECT DISTINCT regexp_matches[1]
    FROM regexp_matches(NEW.content, '@([a-zA-Z0-9_]+)', 'g') AS regexp_matches
  LOOP
    -- Find user by username
    SELECT id INTO mentioned_user_id
    FROM profiles
    WHERE username = mentioned_username
    AND is_active = true;

    IF mentioned_user_id IS NOT NULL THEN
      -- Create mention record
      INSERT INTO task_mentions (task_id, comment_id, mentioned_user_id, mentioning_user_id)
      VALUES (NEW.task_id, NEW.id, mentioned_user_id, NEW.user_id);

      -- Add mentioned user as watcher
      INSERT INTO task_watchers (task_id, user_id)
      VALUES (NEW.task_id, mentioned_user_id)
      ON CONFLICT (task_id, user_id) DO NOTHING;

      -- Create notification
      INSERT INTO task_notifications (
        task_id,
        user_id,
        notification_type,
        message,
        created_by
      )
      VALUES (
        NEW.task_id,
        mentioned_user_id,
        'mention',
        'mentioned you in a comment on task: ' || task_title,
        NEW.user_id
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

-- Function to notify all watchers of new comments
CREATE OR REPLACE FUNCTION notify_watchers_of_comment()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  watcher_record record;
  task_title text;
  commenter_name text;
BEGIN
  -- Get task title and commenter name
  SELECT t.title, p.full_name
  INTO task_title, commenter_name
  FROM tasks t, profiles p
  WHERE t.id = NEW.task_id
  AND p.id = NEW.user_id;

  -- Notify all watchers except the commenter
  FOR watcher_record IN
    SELECT user_id
    FROM task_watchers
    WHERE task_id = NEW.task_id
    AND user_id != NEW.user_id
  LOOP
    INSERT INTO task_notifications (
      task_id,
      user_id,
      notification_type,
      message,
      created_by
    )
    VALUES (
      NEW.task_id,
      watcher_record.user_id,
      'comment',
      commenter_name || ' commented on task: ' || task_title,
      NEW.user_id
    );
  END LOOP;

  RETURN NEW;
END;
$$;

-- Add commenter as watcher
CREATE OR REPLACE FUNCTION auto_watch_commented_task()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO task_watchers (task_id, user_id)
  VALUES (NEW.task_id, NEW.user_id)
  ON CONFLICT (task_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Create triggers
DROP TRIGGER IF EXISTS auto_watch_created_task_trigger ON tasks;
CREATE TRIGGER auto_watch_created_task_trigger
  AFTER INSERT ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION auto_watch_created_task();

DROP TRIGGER IF EXISTS auto_watch_assigned_task_trigger ON tasks;
CREATE TRIGGER auto_watch_assigned_task_trigger
  AFTER UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION auto_watch_assigned_task();

DROP TRIGGER IF EXISTS auto_watch_commented_task_trigger ON task_comments;
CREATE TRIGGER auto_watch_commented_task_trigger
  AFTER INSERT ON task_comments
  FOR EACH ROW
  EXECUTE FUNCTION auto_watch_commented_task();

DROP TRIGGER IF EXISTS process_task_comment_mentions_trigger ON task_comments;
CREATE TRIGGER process_task_comment_mentions_trigger
  AFTER INSERT ON task_comments
  FOR EACH ROW
  EXECUTE FUNCTION process_task_comment_mentions();

DROP TRIGGER IF EXISTS notify_watchers_of_comment_trigger ON task_comments;
CREATE TRIGGER notify_watchers_of_comment_trigger
  AFTER INSERT ON task_comments
  FOR EACH ROW
  EXECUTE FUNCTION notify_watchers_of_comment();

-- Add updated_at trigger for task_comments
CREATE OR REPLACE FUNCTION update_task_comment_updated_at()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_task_comment_updated_at_trigger ON task_comments;
CREATE TRIGGER update_task_comment_updated_at_trigger
  BEFORE UPDATE ON task_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_task_comment_updated_at();
