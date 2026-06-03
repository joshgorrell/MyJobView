/*
  # Create Staff Video Library System

  ## Summary
  Adds a reusable video library for sales reps to save and share recorded videos
  (thank you messages, introductions, etc.) that can be attached to any proposal.

  ## New Tables
  - `staff_video_library` - Stores reusable rep video recordings
    - `id` (uuid, pk)
    - `organization_id` (uuid, fk organizations)
    - `created_by` (uuid, fk profiles) - the rep who owns it
    - `title` (text) - display name for the video
    - `description` (text, nullable) - optional notes/description
    - `video_type` (text) - enum: thank_you, introduction, general, other
    - `storage_path` (text, nullable) - path in proposal-recordings bucket
    - `duration_seconds` (integer, nullable)
    - `is_public` (boolean, default false) - if true, org members can view/use
    - `is_active` (boolean, default true)
    - `sort_order` (integer, default 0)
    - `created_at`, `updated_at`

  ## Modified Tables
  - `proposal_recordings` - Adds optional `library_video_id` FK so a proposal
    recording can reference a library video (storage_path is copied on insert,
    so portal display needs no changes)

  ## Security
  - RLS enabled on staff_video_library
  - Owner: full CRUD
  - Org members: read-only when is_public = true
  - No portal user access
*/

-- Staff video library table
CREATE TABLE IF NOT EXISTS staff_video_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'My Video',
  description text,
  video_type text NOT NULL DEFAULT 'general' CHECK (video_type IN ('thank_you', 'introduction', 'general', 'other')),
  storage_path text,
  duration_seconds integer,
  is_public boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_staff_video_library_updated_at()
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

CREATE TRIGGER staff_video_library_updated_at
  BEFORE UPDATE ON staff_video_library
  FOR EACH ROW EXECUTE FUNCTION update_staff_video_library_updated_at();

-- RLS
ALTER TABLE staff_video_library ENABLE ROW LEVEL SECURITY;

-- Owner can read their own videos
CREATE POLICY "Owner can view own library videos"
  ON staff_video_library FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());

-- Org members can read public videos
CREATE POLICY "Org members can view public library videos"
  ON staff_video_library FOR SELECT
  TO authenticated
  USING (
    is_public = true
    AND organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
  );

-- Owner can insert
CREATE POLICY "Owner can insert library videos"
  ON staff_video_library FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

-- Owner can update their own
CREATE POLICY "Owner can update own library videos"
  ON staff_video_library FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- Owner can delete their own
CREATE POLICY "Owner can delete own library videos"
  ON staff_video_library FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

-- Indexes
CREATE INDEX IF NOT EXISTS idx_staff_video_library_org_id ON staff_video_library(organization_id);
CREATE INDEX IF NOT EXISTS idx_staff_video_library_created_by ON staff_video_library(created_by);
CREATE INDEX IF NOT EXISTS idx_staff_video_library_is_public ON staff_video_library(organization_id, is_public) WHERE is_public = true;

-- Add library_video_id to proposal_recordings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposal_recordings' AND column_name = 'library_video_id'
  ) THEN
    ALTER TABLE proposal_recordings
      ADD COLUMN library_video_id uuid REFERENCES staff_video_library(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_proposal_recordings_library_video_id ON proposal_recordings(library_video_id);
