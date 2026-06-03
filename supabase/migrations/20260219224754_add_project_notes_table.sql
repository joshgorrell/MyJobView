/*
  # Add Project Notes Table

  ## Summary
  Creates a `project_notes` table to store freeform notes attached to projects.
  These notes appear in the project History tab alongside work order events.

  ## New Tables
  - `project_notes`
    - `id` (uuid, primary key)
    - `organization_id` (uuid, FK to organizations) - for multi-tenant isolation
    - `project_id` (uuid, FK to projects) - the project this note belongs to
    - `author_id` (uuid, FK to profiles) - who wrote the note
    - `body` (text) - the note content
    - `is_internal` (boolean, default false) - internal notes visible only to staff with elevated roles
    - `created_at` (timestamptz, default now())
    - `updated_at` (timestamptz, default now())

  ## Security
  - RLS enabled with restrictive policies
  - All authenticated users in the same organization can read non-internal notes
  - Only admin/manager/service_manager roles can read internal notes
  - Any authenticated user can create notes (is_internal = false only unless elevated role)
  - Authors and admins can delete their own notes

  ## Indexes
  - Index on project_id for fast lookups
  - Index on author_id for foreign key performance
  - Index on organization_id for tenant isolation
*/

CREATE TABLE IF NOT EXISTS project_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  author_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  body text NOT NULL CHECK (char_length(trim(body)) > 0),
  is_internal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_notes_project_id ON project_notes(project_id);
CREATE INDEX IF NOT EXISTS idx_project_notes_author_id ON project_notes(author_id);
CREATE INDEX IF NOT EXISTS idx_project_notes_organization_id ON project_notes(organization_id);
CREATE INDEX IF NOT EXISTS idx_project_notes_created_at ON project_notes(project_id, created_at DESC);

ALTER TABLE project_notes ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read non-internal notes for their organization
CREATE POLICY "Users can read non-internal project notes"
  ON project_notes FOR SELECT
  TO authenticated
  USING (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND (
      is_internal = false
      OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'manager', 'service_manager', 'production_manager')
    )
  );

-- Any authenticated user in the org can insert notes
CREATE POLICY "Users can insert project notes"
  ON project_notes FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND author_id = auth.uid()
    AND (
      is_internal = false
      OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'manager', 'service_manager', 'production_manager')
    )
  );

-- Authors can update their own notes; admins can update any
CREATE POLICY "Authors and admins can update project notes"
  ON project_notes FOR UPDATE
  TO authenticated
  USING (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND (
      author_id = auth.uid()
      OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'manager')
    )
  )
  WITH CHECK (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND (
      author_id = auth.uid()
      OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'manager')
    )
  );

-- Authors and admins can delete notes
CREATE POLICY "Authors and admins can delete project notes"
  ON project_notes FOR DELETE
  TO authenticated
  USING (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND (
      author_id = auth.uid()
      OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'manager')
    )
  );

-- Auto-update updated_at on changes
CREATE OR REPLACE FUNCTION update_project_notes_updated_at()
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

CREATE TRIGGER project_notes_updated_at
  BEFORE UPDATE ON project_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_project_notes_updated_at();
