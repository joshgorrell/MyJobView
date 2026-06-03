/*
  # Create Proposal Weekly Notes Table

  ## Summary
  Adds a weekly check-in system for sales reps to log brief status updates on active proposals.

  ## New Tables
  - `proposal_weekly_notes`
    - `id` (uuid, primary key)
    - `proposal_id` (uuid, FK to proposals)
    - `rep_id` (uuid, FK to profiles — the rep who owns the proposal)
    - `created_by` (uuid, FK to profiles — who filed the note, could be manager)
    - `week_start_date` (date — the Monday of the week this note belongs to)
    - `status_note` (text — structured status label)
    - `free_text` (text, nullable — optional detail)
    - `organization_id` (uuid, FK to organizations)
    - `created_at`, `updated_at`

  ## Constraints
  - Unique: one note per proposal per rep per week (upsert-safe)

  ## Security
  - RLS enabled
  - Reps can insert/update/select their own notes
  - Managers and admins can select all notes in their org
  - Managers and admins can insert/update on behalf of any rep in their org
*/

CREATE TABLE IF NOT EXISTS proposal_weekly_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  rep_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  week_start_date date NOT NULL,
  status_note text NOT NULL,
  free_text text,
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT unique_proposal_rep_week UNIQUE (proposal_id, rep_id, week_start_date)
);

CREATE INDEX IF NOT EXISTS idx_proposal_weekly_notes_proposal_id ON proposal_weekly_notes(proposal_id);
CREATE INDEX IF NOT EXISTS idx_proposal_weekly_notes_rep_id ON proposal_weekly_notes(rep_id);
CREATE INDEX IF NOT EXISTS idx_proposal_weekly_notes_week_start_date ON proposal_weekly_notes(week_start_date);
CREATE INDEX IF NOT EXISTS idx_proposal_weekly_notes_organization_id ON proposal_weekly_notes(organization_id);

ALTER TABLE proposal_weekly_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reps can view own weekly notes"
  ON proposal_weekly_notes FOR SELECT
  TO authenticated
  USING (
    rep_id = auth.uid()
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'manager')
        AND p.organization_id = proposal_weekly_notes.organization_id
    )
  );

CREATE POLICY "Reps can insert own weekly notes"
  ON proposal_weekly_notes FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      rep_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
          AND p.role IN ('admin', 'manager')
          AND p.organization_id = proposal_weekly_notes.organization_id
      )
    )
  );

CREATE POLICY "Reps can update own weekly notes"
  ON proposal_weekly_notes FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'manager')
        AND p.organization_id = proposal_weekly_notes.organization_id
    )
  )
  WITH CHECK (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'manager')
        AND p.organization_id = proposal_weekly_notes.organization_id
    )
  );

CREATE OR REPLACE FUNCTION update_proposal_weekly_notes_updated_at()
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

CREATE TRIGGER update_proposal_weekly_notes_updated_at
  BEFORE UPDATE ON proposal_weekly_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_proposal_weekly_notes_updated_at();
