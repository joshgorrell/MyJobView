/*
  # Create Project Activity Logs Table

  ## Purpose
  Allows Project Managers, Admins, and Managers to document site surveys and
  non-work-order time spent on a project (e.g. site surveys, planning/design,
  client meetings, travel). This is for project tracking only — not connected
  to the payroll/time clock system.

  ## New Tables
  - `project_activity_logs`
    - id (uuid, PK)
    - project_id (uuid, FK to projects) — required
    - logged_by (uuid, FK to profiles) — who logged it
    - company_id (uuid) — multi-tenant scoping
    - activity_type (text) — site_survey | planning_design | client_meeting | travel | other
    - duration_minutes (integer) — time spent, must be > 0
    - notes (text, NOT NULL) — required description of work done
    - logged_at (date) — date the activity occurred, defaults to today
    - created_at (timestamptz)

  ## Security
  - RLS enabled; users can only access rows for their own company
  - Insert: authenticated users (role-gating handled in the frontend)
  - Select: authenticated users for their own company
  - Delete: logged_by user can delete their own entries; admins can delete any
*/

CREATE TABLE IF NOT EXISTS project_activity_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  logged_by       uuid NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  company_id      uuid NOT NULL,
  activity_type   text NOT NULL CHECK (activity_type IN ('site_survey','planning_design','client_meeting','travel','other')),
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
  notes           text NOT NULL CHECK (trim(notes) <> ''),
  logged_at       date NOT NULL DEFAULT CURRENT_DATE,
  created_at      timestamptz DEFAULT now()
);

-- Index for fast project-scoped queries
CREATE INDEX IF NOT EXISTS idx_project_activity_logs_project_id
  ON project_activity_logs(project_id);

CREATE INDEX IF NOT EXISTS idx_project_activity_logs_logged_by
  ON project_activity_logs(logged_by);

CREATE INDEX IF NOT EXISTS idx_project_activity_logs_company_id
  ON project_activity_logs(company_id);

-- Enable RLS
ALTER TABLE project_activity_logs ENABLE ROW LEVEL SECURITY;

-- SELECT: any authenticated user within the same company
CREATE POLICY "Company members can view project activity logs"
  ON project_activity_logs
  FOR SELECT
  TO authenticated
  USING (
    company_id = (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  );

-- INSERT: authenticated users (role check done in frontend)
CREATE POLICY "Authenticated users can insert project activity logs"
  ON project_activity_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    logged_by = auth.uid()
    AND company_id = (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  );

-- DELETE: the original logger OR an admin/manager
CREATE POLICY "Logger or admin can delete project activity logs"
  ON project_activity_logs
  FOR DELETE
  TO authenticated
  USING (
    logged_by = auth.uid()
    OR (
      SELECT role FROM profiles WHERE id = auth.uid()
    ) IN ('admin', 'manager')
  );
