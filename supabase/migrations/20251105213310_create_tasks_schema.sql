/*
  # Create Tasks Schema

  1. New Tables
    - `tasks`
      - `id` (uuid, primary key)
      - `lead_id` (uuid, foreign key to leads table)
      - `user_id` (uuid, foreign key to profiles table - task creator)
      - `title` (text) - Brief description of the task
      - `description` (text, nullable) - Detailed task information
      - `status` (text) - Task status: pending, in_progress, completed, cancelled
      - `priority` (text) - Task priority: low, medium, high, urgent
      - `due_date` (timestamptz, nullable) - When the task should be completed
      - `completed_at` (timestamptz, nullable) - When the task was completed
      - `created_at` (timestamptz) - When the task was created
      - `updated_at` (timestamptz) - When the task was last updated

  2. Security
    - Enable RLS on `tasks` table
    - Add policies for authenticated users to:
      - View tasks for leads they have access to
      - Create tasks for leads they have access to
      - Update their own tasks
      - Delete their own tasks

  3. Indexes
    - Add index on `lead_id` for faster lookups
    - Add index on `user_id` for filtering by creator
    - Add index on `status` for filtering by status
    - Add index on `due_date` for sorting by due date
*/

CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  priority text NOT NULL DEFAULT 'medium',
  due_date timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS tasks_lead_id_idx ON tasks(lead_id);
CREATE INDEX IF NOT EXISTS tasks_user_id_idx ON tasks(user_id);
CREATE INDEX IF NOT EXISTS tasks_status_idx ON tasks(status);
CREATE INDEX IF NOT EXISTS tasks_due_date_idx ON tasks(due_date);

CREATE POLICY "Users can view tasks for accessible leads"
  ON tasks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM leads
      WHERE leads.id = tasks.lead_id
      AND (leads.assigned_to = auth.uid() OR leads.created_by = auth.uid() OR EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
      ))
    )
  );

CREATE POLICY "Users can create tasks for accessible leads"
  ON tasks FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM leads
      WHERE leads.id = tasks.lead_id
      AND (leads.assigned_to = auth.uid() OR leads.created_by = auth.uid() OR EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
      ))
    )
    AND user_id = auth.uid()
  );

CREATE POLICY "Users can update their own tasks"
  ON tasks FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own tasks"
  ON tasks FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_tasks_updated_at ON tasks;
CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();