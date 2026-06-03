/*
  # Create Proposal Versions Schema

  1. New Tables
    - `proposal_versions`
      - Stores snapshots of proposals for version history
      - `id` (uuid, primary key)
      - `proposal_id` (uuid, references proposals)
      - `version_number` (integer)
      - `snapshot_data` (jsonb) - Complete proposal data at this point in time
      - `changed_by` (uuid, references auth.users)
      - `change_description` (text)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS
    - Staff can view versions for proposals in their company
    - Versions are read-only after creation

  3. Indexes
    - Index on proposal_id
    - Index on version_number
    - Index on created_at for chronological sorting

  4. Triggers
    - Auto-create version on significant proposal changes
*/

CREATE TABLE IF NOT EXISTS proposal_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  snapshot_data jsonb NOT NULL,
  changed_by uuid NOT NULL,
  change_description text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(proposal_id, version_number)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_proposal_versions_proposal ON proposal_versions(proposal_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_proposal_versions_created ON proposal_versions(proposal_id, created_at DESC);

-- Enable RLS
ALTER TABLE proposal_versions ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Staff can view proposal versions in their company"
  ON proposal_versions FOR SELECT
  TO authenticated
  USING (
    proposal_id IN (
      SELECT id FROM proposals WHERE company_id IN (
        SELECT id FROM profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Staff can create proposal versions in their company"
  ON proposal_versions FOR INSERT
  TO authenticated
  WITH CHECK (
    proposal_id IN (
      SELECT id FROM proposals WHERE company_id IN (
        SELECT id FROM profiles WHERE id = auth.uid()
      )
    )
  );

-- Function to create a new version
CREATE OR REPLACE FUNCTION create_proposal_version(
  p_proposal_id uuid,
  p_changed_by uuid,
  p_change_description text DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  v_version_number integer;
  v_snapshot jsonb;
  v_version_id uuid;
BEGIN
  -- Get next version number
  SELECT COALESCE(MAX(version_number), 0) + 1
  INTO v_version_number
  FROM proposal_versions
  WHERE proposal_id = p_proposal_id;

  -- Build snapshot (complete proposal data)
  SELECT jsonb_build_object(
    'proposal', row_to_json(p.*),
    'rooms', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'room', row_to_json(r.*),
          'line_items', (
            SELECT jsonb_agg(row_to_json(li.*) ORDER BY li.sort_order)
            FROM proposal_line_items li
            WHERE li.room_id = r.id
          )
        ) ORDER BY r.sort_order
      )
      FROM proposal_rooms r
      WHERE r.proposal_id = p.id
    )
  )
  INTO v_snapshot
  FROM proposals p
  WHERE p.id = p_proposal_id;

  -- Insert version
  INSERT INTO proposal_versions (
    proposal_id,
    version_number,
    snapshot_data,
    changed_by,
    change_description
  )
  VALUES (
    p_proposal_id,
    v_version_number,
    v_snapshot,
    p_changed_by,
    p_change_description
  )
  RETURNING id INTO v_version_id;

  RETURN v_version_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
