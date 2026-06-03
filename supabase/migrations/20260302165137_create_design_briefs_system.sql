/*
  # Create Design Briefs System

  ## Summary
  This migration creates the infrastructure for the AI-powered Design Brief system,
  which allows sales reps to capture field notes (typed or voice-transcribed) and
  automatically generate a pre-built proposal for the design team.

  ## New Tables

  ### design_briefs
  - `id` (uuid, primary key)
  - `contact_id` (uuid, FK to contacts) — the customer this brief is for
  - `raw_notes` (text) — the sales rep's typed or voice-transcribed field notes
  - `ai_summary` (jsonb) — structured ProposalPrefill JSON output from ChatGPT
  - `status` (text) — draft | submitted | building | ready | archived
  - `created_by` (uuid, FK to profiles) — the sales rep who submitted the brief
  - `submitted_at` (timestamptz) — when the rep hit "Submit to Design Team"
  - `linked_proposal_id` (uuid, nullable FK to proposals) — the auto-created proposal
  - `designer_notes` (text) — notes from the design team back to the rep
  - `created_at` / `updated_at` (timestamptz)

  ## Security
  - RLS enabled with policies for reps (own briefs) and admins/managers (all briefs)

  ## Navigation
  - Adds design_queue module to the Sales department
*/

CREATE TABLE IF NOT EXISTS design_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  raw_notes text NOT NULL DEFAULT '',
  ai_summary jsonb,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'building', 'ready', 'archived')),
  created_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  submitted_at timestamptz,
  linked_proposal_id uuid REFERENCES proposals(id) ON DELETE SET NULL,
  designer_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_design_briefs_contact_id ON design_briefs(contact_id);
CREATE INDEX IF NOT EXISTS idx_design_briefs_created_by ON design_briefs(created_by);
CREATE INDEX IF NOT EXISTS idx_design_briefs_status ON design_briefs(status);
CREATE INDEX IF NOT EXISTS idx_design_briefs_linked_proposal_id ON design_briefs(linked_proposal_id);
CREATE INDEX IF NOT EXISTS idx_design_briefs_submitted_at ON design_briefs(submitted_at DESC);

ALTER TABLE design_briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own design briefs"
  ON design_briefs FOR SELECT
  TO authenticated
  USING (auth.uid() = created_by);

CREATE POLICY "Admins and managers can view all design briefs"
  ON design_briefs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'manager', 'service_manager')
    )
  );

CREATE POLICY "Authenticated users can create design briefs"
  ON design_briefs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update own draft briefs"
  ON design_briefs FOR UPDATE
  TO authenticated
  USING (auth.uid() = created_by AND status = 'draft')
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Admins and managers can update any design brief"
  ON design_briefs FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'manager', 'service_manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'manager', 'service_manager')
    )
  );

CREATE POLICY "Users can delete own draft briefs"
  ON design_briefs FOR DELETE
  TO authenticated
  USING (auth.uid() = created_by AND status = 'draft');

CREATE OR REPLACE FUNCTION update_design_briefs_updated_at()
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

CREATE TRIGGER design_briefs_updated_at
  BEFORE UPDATE ON design_briefs
  FOR EACH ROW
  EXECUTE FUNCTION update_design_briefs_updated_at();

DO $$
DECLARE
  v_org_id uuid;
  v_dept_id uuid := '68fe6721-aba9-4660-bfc2-d76231245dbd';
BEGIN
  SELECT organization_id INTO v_org_id FROM department_modules LIMIT 1;

  IF NOT EXISTS (
    SELECT 1 FROM department_modules WHERE module_key = 'design_queue'
  ) THEN
    INSERT INTO department_modules (department_id, module_key, display_name, icon, sort_order, is_active, organization_id)
    VALUES (
      v_dept_id,
      'design_queue',
      'Design Queue',
      'pen-tool',
      45,
      true,
      v_org_id
    );
  END IF;
END $$;
