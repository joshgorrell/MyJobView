/*
  # Fix Task Watchers RLS Policies

  1. Changes
    - Simplify task_watchers RLS policies to make them more reliable
    - Allow users to watch tasks they can view
    - Allow users to unwatch tasks they're watching
  
  2. Security
    - Users can only add themselves as watchers
    - Users can only remove themselves as watchers
    - Users can view watchers on tasks they have access to
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Users can add themselves as watchers" ON task_watchers;
DROP POLICY IF EXISTS "Users can remove themselves as watchers" ON task_watchers;
DROP POLICY IF EXISTS "Users can view watchers on tasks they can access" ON task_watchers;

-- Recreate with simpler logic
-- Users can view watchers if they can view the task
CREATE POLICY "Users can view watchers on accessible tasks"
  ON task_watchers FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tasks
      WHERE tasks.id = task_watchers.task_id
    )
  );

-- Users can add themselves as watchers on any task they can access
CREATE POLICY "Users can watch tasks they can access"
  ON task_watchers FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM tasks
      WHERE tasks.id = task_watchers.task_id
    )
  );

-- Users can remove themselves as watchers
CREATE POLICY "Users can unwatch tasks"
  ON task_watchers FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());