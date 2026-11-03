/*\n  # Update Tasks for Assignment and Add Rewards System\n\n  1. Changes to Tasks Table\n    - Add `assigned_to` (uuid, nullable) - User the task is assigned to (null = anyone can claim)\n    - Add `claimed_by` (uuid, nullable) - User who claimed the task (for "anyone" tasks)\n    - Add `points` (integer) - Points awarded for completing this task\n    - Update RLS policies to support assignment and claiming\n\n  2. New Tables\n    - `user_points`\n      - `id` (uuid, primary key)\n      - `user_id` (uuid, foreign key to profiles)\n      - `total_points` (integer) - Running total of points\n      - `created_at` (timestamptz)\n      - `updated_at` (timestamptz)\n\n    - `points_history`\n      - `id` (uuid, primary key)\n      - `user_id` (uuid, foreign key to profiles)\n      - `task_id` (uuid, nullable, foreign key to tasks)\n      - `points` (integer) - Points earned/deducted\n      - `reason` (text) - Description of why points were awarded\n      - `created_at` (timestamptz)\n\n  3. Security\n    - Enable RLS on new tables\n    - Update task policies to support assignment and claiming\n    - Users can view all user points (leaderboard)\n    - Users can only update their own tasks they created or are assigned to\n\n  4. Functions\n    - Create function to award points when task is completed\n    - Create trigger to automatically award points on task completion\n*/\n\n-- Add new columns to tasks table\nDO $$\nBEGIN\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'tasks' AND column_name = 'assigned_to'\n  ) THEN\n    ALTER TABLE tasks ADD COLUMN assigned_to uuid REFERENCES profiles(id) ON DELETE SET NULL

\n  END IF

\n\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'tasks' AND column_name = 'claimed_by'\n  ) THEN\n    ALTER TABLE tasks ADD COLUMN claimed_by uuid REFERENCES profiles(id) ON DELETE SET NULL

\n  END IF

\n\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'tasks' AND column_name = 'points'\n  ) THEN\n    ALTER TABLE tasks ADD COLUMN points integer DEFAULT 10

\n  END IF

\nEND $$

\n\n-- Create user_points table\nCREATE TABLE IF NOT EXISTS user_points (\n  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n  user_id uuid UNIQUE NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,\n  total_points integer DEFAULT 0,\n  created_at timestamptz DEFAULT now(),\n  updated_at timestamptz DEFAULT now()\n)

\n\nALTER TABLE user_points ENABLE ROW LEVEL SECURITY

\n\n-- Create points_history table\nCREATE TABLE IF NOT EXISTS points_history (\n  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,\n  task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,\n  points integer NOT NULL,\n  reason text NOT NULL,\n  created_at timestamptz DEFAULT now()\n)

\n\nALTER TABLE points_history ENABLE ROW LEVEL SECURITY

\n\n-- Create indexes\nCREATE INDEX IF NOT EXISTS tasks_assigned_to_idx ON tasks(assigned_to)

\nCREATE INDEX IF NOT EXISTS tasks_claimed_by_idx ON tasks(claimed_by)

\nCREATE INDEX IF NOT EXISTS user_points_user_id_idx ON user_points(user_id)

\nCREATE INDEX IF NOT EXISTS points_history_user_id_idx ON points_history(user_id)

\nCREATE INDEX IF NOT EXISTS points_history_task_id_idx ON points_history(task_id)

\n\n-- RLS Policies for user_points\nCREATE POLICY "All authenticated users can view user points"\n  ON user_points\n  FOR SELECT\n  TO authenticated\n  USING (true)

\n\nCREATE POLICY "System can insert user points"\n  ON user_points\n  FOR INSERT\n  TO authenticated\n  WITH CHECK (true)

\n\nCREATE POLICY "System can update user points"\n  ON user_points\n  FOR UPDATE\n  TO authenticated\n  USING (true)\n  WITH CHECK (true)

\n\n-- RLS Policies for points_history\nCREATE POLICY "Users can view all points history"\n  ON points_history\n  FOR SELECT\n  TO authenticated\n  USING (true)

\n\nCREATE POLICY "System can insert points history"\n  ON points_history\n  FOR INSERT\n  TO authenticated\n  WITH CHECK (true)

\n\n-- Drop old task policies\nDROP POLICY IF EXISTS "Users can view tasks for accessible leads" ON tasks

\nDROP POLICY IF EXISTS "Users can create tasks for accessible leads" ON tasks

\nDROP POLICY IF EXISTS "Users can update their own tasks" ON tasks

\nDROP POLICY IF EXISTS "Users can delete their own tasks" ON tasks

\n\n-- New task policies supporting assignment\nCREATE POLICY "Users can view tasks they have access to"\n  ON tasks\n  FOR SELECT\n  TO authenticated\n  USING (\n    -- Task creator can see it\n    user_id = auth.uid()\n    -- Assigned user can see it\n    OR assigned_to = auth.uid()\n    -- User who claimed it can see it\n    OR claimed_by = auth.uid()\n    -- Anyone can see unassigned tasks\n    OR assigned_to IS NULL\n    -- Admins can see all\n    OR EXISTS (\n      SELECT 1 FROM profiles\n      WHERE profiles.id = auth.uid()\n      AND profiles.role = 'admin'\n    )\n  )

\n\nCREATE POLICY "Users can create tasks"\n  ON tasks\n  FOR INSERT\n  TO authenticated\n  WITH CHECK (user_id = auth.uid())

\n\nCREATE POLICY "Users can update tasks they created, are assigned to, or claimed"\n  ON tasks\n  FOR UPDATE\n  TO authenticated\n  USING (\n    user_id = auth.uid()\n    OR assigned_to = auth.uid()\n    OR claimed_by = auth.uid()\n    OR EXISTS (\n      SELECT 1 FROM profiles\n      WHERE profiles.id = auth.uid()\n      AND profiles.role = 'admin'\n    )\n  )\n  WITH CHECK (\n    user_id = auth.uid()\n    OR assigned_to = auth.uid()\n    OR claimed_by = auth.uid()\n    OR EXISTS (\n      SELECT 1 FROM profiles\n      WHERE profiles.id = auth.uid()\n      AND profiles.role = 'admin'\n    )\n  )

\n\nCREATE POLICY "Users can delete tasks they created"\n  ON tasks\n  FOR DELETE\n  TO authenticated\n  USING (\n    user_id = auth.uid()\n    OR EXISTS (\n      SELECT 1 FROM profiles\n      WHERE profiles.id = auth.uid()\n      AND profiles.role = 'admin'\n    )\n  )

\n\n-- Function to award points when task is completed\nCREATE OR REPLACE FUNCTION award_task_points()\nRETURNS TRIGGER AS $$\nDECLARE\n  target_user_id uuid

\n  task_points integer

\nBEGIN\n  -- Only award points when task is newly marked as completed\n  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN\n    -- Determine who completed the task\n    IF NEW.claimed_by IS NOT NULL THEN\n      target_user_id := NEW.claimed_by

\n    ELSIF NEW.assigned_to IS NOT NULL THEN\n      target_user_id := NEW.assigned_to

\n    ELSE\n      target_user_id := NEW.user_id

\n    END IF

\n\n    task_points := COALESCE(NEW.points, 10)

\n\n    -- Create or update user_points record\n    INSERT INTO user_points (user_id, total_points)\n    VALUES (target_user_id, task_points)\n    ON CONFLICT (user_id)\n    DO UPDATE SET\n      total_points = user_points.total_points + task_points,\n      updated_at = now()

\n\n    -- Add to points history\n    INSERT INTO points_history (user_id, task_id, points, reason)\n    VALUES (\n      target_user_id,\n      NEW.id,\n      task_points,\n      'Completed task: ' || NEW.title\n    )

\n  END IF

\n\n  RETURN NEW

\nEND

\n$$ LANGUAGE plpgsql

\n\n-- Create trigger for awarding points\nDROP TRIGGER IF EXISTS award_points_on_task_completion ON tasks

\nCREATE TRIGGER award_points_on_task_completion\n  AFTER UPDATE ON tasks\n  FOR EACH ROW\n  EXECUTE FUNCTION award_task_points()

\n\n-- Initialize user_points for existing users\nINSERT INTO user_points (user_id, total_points)\nSELECT id, 0\nFROM profiles\nWHERE is_active = true\nON CONFLICT (user_id) DO NOTHING


