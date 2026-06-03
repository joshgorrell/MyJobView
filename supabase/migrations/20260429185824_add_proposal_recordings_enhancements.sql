/*
  # Enhance proposal_recordings table

  1. Changes to proposal_recordings table
    - Add `is_portal_visible` boolean (default true) - controls per-recording portal visibility
    - Add `recording_scope` text column ('full_proposal' or 'area') - explicit scope label
    - Add `storage_path` text column - for Supabase Storage uploaded videos
    - Add `duration_seconds` integer - display recording length to customers
    - Make video_url nullable (storage_path used for in-app recordings)

  2. Security
    - Enable RLS on proposal_recordings
    - Staff: full CRUD on their organization's proposal recordings
    - Portal users: read-only, only visible recordings, only while proposal is active

  3. Notes
    - profiles uses organization_id (not company_id)
    - proposals uses both company_id and organization_id - we join via organization_id
    - The active-proposal gate is enforced at RLS level for portal users
    - Viewable statuses: sent, viewed, approved, approved_pending_action
*/

-- Add enhancement columns to existing proposal_recordings table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposal_recordings' AND column_name = 'is_portal_visible'
  ) THEN
    ALTER TABLE proposal_recordings ADD COLUMN is_portal_visible boolean NOT NULL DEFAULT true;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposal_recordings' AND column_name = 'recording_scope'
  ) THEN
    ALTER TABLE proposal_recordings ADD COLUMN recording_scope text NOT NULL DEFAULT 'full_proposal' CHECK (recording_scope IN ('full_proposal', 'area'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposal_recordings' AND column_name = 'storage_path'
  ) THEN
    ALTER TABLE proposal_recordings ADD COLUMN storage_path text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposal_recordings' AND column_name = 'duration_seconds'
  ) THEN
    ALTER TABLE proposal_recordings ADD COLUMN duration_seconds integer;
  END IF;
END $$;

-- Make video_url nullable (not required when storage_path is used)
ALTER TABLE proposal_recordings ALTER COLUMN video_url DROP NOT NULL;
ALTER TABLE proposal_recordings ALTER COLUMN video_url SET DEFAULT NULL;

-- Ensure title has a sensible default
ALTER TABLE proposal_recordings ALTER COLUMN title SET DEFAULT 'Presentation Recording';

-- Ensure RLS is enabled
ALTER TABLE proposal_recordings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any, then recreate cleanly
DROP POLICY IF EXISTS "Staff can view proposal recordings" ON proposal_recordings;
DROP POLICY IF EXISTS "Staff can insert proposal recordings" ON proposal_recordings;
DROP POLICY IF EXISTS "Staff can update proposal recordings" ON proposal_recordings;
DROP POLICY IF EXISTS "Staff can delete proposal recordings" ON proposal_recordings;
DROP POLICY IF EXISTS "Portal users can view active proposal recordings" ON proposal_recordings;

-- Staff: select their organization's recordings via proposal join
CREATE POLICY "Staff can view proposal recordings"
  ON proposal_recordings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM proposals p
      JOIN profiles pr ON pr.organization_id = p.organization_id
      WHERE p.id = proposal_recordings.proposal_id
        AND pr.id = (SELECT auth.uid())
        AND (pr.role IS NULL OR pr.role != 'portal_user')
    )
  );

-- Staff: insert recordings for their organization's proposals
CREATE POLICY "Staff can insert proposal recordings"
  ON proposal_recordings FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM proposals p
      JOIN profiles pr ON pr.organization_id = p.organization_id
      WHERE p.id = proposal_recordings.proposal_id
        AND pr.id = (SELECT auth.uid())
        AND (pr.role IS NULL OR pr.role != 'portal_user')
    )
  );

-- Staff: update recordings for their organization's proposals
CREATE POLICY "Staff can update proposal recordings"
  ON proposal_recordings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM proposals p
      JOIN profiles pr ON pr.organization_id = p.organization_id
      WHERE p.id = proposal_recordings.proposal_id
        AND pr.id = (SELECT auth.uid())
        AND (pr.role IS NULL OR pr.role != 'portal_user')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM proposals p
      JOIN profiles pr ON pr.organization_id = p.organization_id
      WHERE p.id = proposal_recordings.proposal_id
        AND pr.id = (SELECT auth.uid())
        AND (pr.role IS NULL OR pr.role != 'portal_user')
    )
  );

-- Staff: delete recordings for their organization's proposals
CREATE POLICY "Staff can delete proposal recordings"
  ON proposal_recordings FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM proposals p
      JOIN profiles pr ON pr.organization_id = p.organization_id
      WHERE p.id = proposal_recordings.proposal_id
        AND pr.id = (SELECT auth.uid())
        AND (pr.role IS NULL OR pr.role != 'portal_user')
    )
  );

-- Portal users: read-only, only visible recordings, only while proposal is active
CREATE POLICY "Portal users can view active proposal recordings"
  ON proposal_recordings FOR SELECT
  TO authenticated
  USING (
    is_portal_visible = true
    AND (SELECT auth.jwt() -> 'user_metadata' ->> 'is_portal_user') = 'true'
    AND EXISTS (
      SELECT 1 FROM proposals p
      WHERE p.id = proposal_recordings.proposal_id
        AND p.status IN ('sent', 'viewed', 'approved', 'approved_pending_action')
    )
  );

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_proposal_recordings_proposal_id ON proposal_recordings(proposal_id);
CREATE INDEX IF NOT EXISTS idx_proposal_recordings_room_id ON proposal_recordings(room_id) WHERE room_id IS NOT NULL;
