/*
  # Create Internal Time Sessions System

  ## Summary
  Adds support for "Shop Time" and "Training" internal appointments that allow
  admins/service managers to schedule paid non-job time for technicians and
  hourly employees (chores, training, bench work, etc.).

  ## New Tables
  - `internal_time_sessions`: Stores scheduled shop time / training sessions
    - `session_type`: 'shop_time' or 'training'
    - `assigned_to`: the employee this session is for
    - `predetermined_hours`: optional fixed-hour block (bypasses live clock-in)
    - `status`: scheduled → in_progress → completed / cancelled

  ## Modified Tables
  - `time_entries`: adds `entry_type` column and `internal_session_id` FK
    - `entry_type`: 'work_order' | 'project' | 'shop_time' | 'training'
    - `internal_session_id`: links entry back to the session if applicable

  ## Security
  - RLS enabled on `internal_time_sessions`
  - Admins/managers/service_managers can read, insert, update all sessions
  - Employees can read sessions assigned to them
  - Only admins can delete sessions

  ## Notes
  - No company_id scoping on internal_time_sessions (single-tenant per deployment)
  - RLS uses role checks on profiles, consistent with existing tables
*/

-- ──────────────────────────────────────────────
-- 1. Create internal_time_sessions table
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS internal_time_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_type text NOT NULL CHECK (session_type IN ('shop_time', 'training')),
  title text NOT NULL,
  description text,
  session_date date NOT NULL,
  start_time time,
  end_time time,
  assigned_to uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
  predetermined_hours numeric(6,2),
  notes text,
  approved_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_internal_time_sessions_assigned_to ON internal_time_sessions(assigned_to);
CREATE INDEX IF NOT EXISTS idx_internal_time_sessions_session_date ON internal_time_sessions(session_date);
CREATE INDEX IF NOT EXISTS idx_internal_time_sessions_status ON internal_time_sessions(status);
CREATE INDEX IF NOT EXISTS idx_internal_time_sessions_session_type ON internal_time_sessions(session_type);

-- RLS
ALTER TABLE internal_time_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and managers can view all internal sessions"
  ON internal_time_sessions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'manager', 'service_manager', 'office_manager', 'dispatch')
    )
    OR assigned_to = auth.uid()
  );

CREATE POLICY "Admins and managers can create internal sessions"
  ON internal_time_sessions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'manager', 'service_manager', 'office_manager')
    )
  );

CREATE POLICY "Admins and managers can update internal sessions"
  ON internal_time_sessions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'manager', 'service_manager', 'office_manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'manager', 'service_manager', 'office_manager')
    )
  );

CREATE POLICY "Admins can delete internal sessions"
  ON internal_time_sessions FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- ──────────────────────────────────────────────
-- 2. Add entry_type and internal_session_id to time_entries
-- ──────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'time_entries' AND column_name = 'entry_type'
  ) THEN
    ALTER TABLE time_entries ADD COLUMN entry_type text NOT NULL DEFAULT 'work_order';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'time_entries' AND column_name = 'internal_session_id'
  ) THEN
    ALTER TABLE time_entries ADD COLUMN internal_session_id uuid REFERENCES internal_time_sessions(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add constraint after column exists (idempotent drop+add)
ALTER TABLE time_entries DROP CONSTRAINT IF EXISTS valid_entry_type;
ALTER TABLE time_entries ADD CONSTRAINT valid_entry_type
  CHECK (entry_type IN ('work_order', 'project', 'shop_time', 'training'));

CREATE INDEX IF NOT EXISTS idx_time_entries_entry_type ON time_entries(entry_type);
CREATE INDEX IF NOT EXISTS idx_time_entries_internal_session_id ON time_entries(internal_session_id);

-- ──────────────────────────────────────────────
-- 3. Updated_at trigger for internal_time_sessions
-- ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_internal_time_sessions_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_internal_time_sessions_updated_at ON internal_time_sessions;
CREATE TRIGGER trg_update_internal_time_sessions_updated_at
  BEFORE UPDATE ON internal_time_sessions
  FOR EACH ROW EXECUTE FUNCTION update_internal_time_sessions_updated_at();
