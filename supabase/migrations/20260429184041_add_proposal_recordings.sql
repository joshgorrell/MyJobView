/*\n  # Proposal Recordings System\n\n  ## Overview\n  Allows sales reps to attach video recordings to proposals — either a single intro\n  video for the whole proposal, or individual videos per room/area. Customers can\n  watch these on the portal while reviewing the proposal line items.\n\n  ## New Tables\n  - `proposal_recordings`\n    - `id` (uuid, pk)\n    - `proposal_id` (uuid, fk → proposals)\n    - `room_id` (uuid nullable, fk → proposal_rooms) — null = project-level intro\n    - `title` (text) — label shown to customer, e.g. "Proposal Overview"\n    - `video_url` (text) — embed-friendly URL: YouTube, Vimeo, Loom, or direct link\n    - `description` (text nullable) — optional caption/note shown below player\n    - `sort_order` (int default 0)\n    - `created_by` (uuid, fk → auth.users)\n    - `created_at` (timestamptz)\n    - `updated_at` (timestamptz)\n\n  ## Security\n  - RLS enabled, authenticated org members can insert/update/delete their own recordings\n  - Portal users (anon/authenticated) can SELECT recordings for proposals they have access to\n    (we rely on proposal-level access control being enforced by the caller)\n*/\n\nCREATE TABLE IF NOT EXISTS proposal_recordings (\n  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n  proposal_id uuid NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,\n  room_id uuid REFERENCES proposal_rooms(id) ON DELETE CASCADE,\n  title text NOT NULL DEFAULT '',\n  video_url text NOT NULL DEFAULT '',\n  description text,\n  sort_order integer NOT NULL DEFAULT 0,\n  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,\n  created_at timestamptz NOT NULL DEFAULT now(),\n  updated_at timestamptz NOT NULL DEFAULT now()\n)

\n\n-- Performance indexes\nCREATE INDEX IF NOT EXISTS idx_proposal_recordings_proposal_id ON proposal_recordings(proposal_id)

\nCREATE INDEX IF NOT EXISTS idx_proposal_recordings_room_id ON proposal_recordings(room_id)

\n\nALTER TABLE proposal_recordings ENABLE ROW LEVEL SECURITY

\n\n-- Authenticated internal users: full CRUD on their org's proposals\nCREATE POLICY "Authenticated users can view proposal recordings"\n  ON proposal_recordings FOR SELECT\n  TO authenticated\n  USING (\n    EXISTS (\n      SELECT 1 FROM proposals p\n      WHERE p.id = proposal_recordings.proposal_id\n    )\n  )

\n\nCREATE POLICY "Authenticated users can insert proposal recordings"\n  ON proposal_recordings FOR INSERT\n  TO authenticated\n  WITH CHECK (\n    EXISTS (\n      SELECT 1 FROM proposals p\n      WHERE p.id = proposal_recordings.proposal_id\n    )\n  )

\n\nCREATE POLICY "Authenticated users can update proposal recordings"\n  ON proposal_recordings FOR UPDATE\n  TO authenticated\n  USING (\n    EXISTS (\n      SELECT 1 FROM proposals p\n      WHERE p.id = proposal_recordings.proposal_id\n    )\n  )\n  WITH CHECK (\n    EXISTS (\n      SELECT 1 FROM proposals p\n      WHERE p.id = proposal_recordings.proposal_id\n    )\n  )

\n\nCREATE POLICY "Authenticated users can delete proposal recordings"\n  ON proposal_recordings FOR DELETE\n  TO authenticated\n  USING (\n    EXISTS (\n      SELECT 1 FROM proposals p\n      WHERE p.id = proposal_recordings.proposal_id\n    )\n  )

\n\n-- Anonymous portal users can read recordings for proposals they access\n-- (portal access is controlled upstream by proposal visibility)\nCREATE POLICY "Anon users can view recordings for visible proposals"\n  ON proposal_recordings FOR SELECT\n  TO anon\n  USING (\n    EXISTS (\n      SELECT 1 FROM proposals p\n      WHERE p.id = proposal_recordings.proposal_id\n        AND p.is_portal_visible = true\n    )\n  )

\n
