/*
  # Create Discussion Post Bump History

  1. New Tables
    - `discussion_post_bumps`
      - `id` (uuid, primary key)
      - `post_id` (uuid, references discussion_posts)
      - `bumped_by` (uuid, references profiles)
      - `bumped_at` (timestamptz)
      - `reason` (text, optional reason for bump)

  2. Security
    - Enable RLS on `discussion_post_bumps` table
    - Add policy for authenticated users to read all bump history
    - Add policy for authenticated users to create bumps
    - Only allow users to bump other people's posts

  3. Purpose
    - Track complete history of all bumps on discussion posts
    - Show when and who bumped posts
    - Prevent users from bumping their own posts
*/

-- Create discussion_post_bumps table
CREATE TABLE IF NOT EXISTS discussion_post_bumps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES discussion_posts(id) ON DELETE CASCADE,
  bumped_by uuid NOT NULL REFERENCES profiles(id),
  bumped_at timestamptz DEFAULT now(),
  reason text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE discussion_post_bumps ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read all bump history
CREATE POLICY "Authenticated users can view bump history"
  ON discussion_post_bumps FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to create bumps (but not their own posts)
CREATE POLICY "Users can bump others' posts"
  ON discussion_post_bumps FOR INSERT
  TO authenticated
  WITH CHECK (
    bumped_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM discussion_posts
      WHERE discussion_posts.id = post_id
      AND discussion_posts.user_id != auth.uid()
    )
  );

-- Add index for efficient querying
CREATE INDEX IF NOT EXISTS idx_discussion_post_bumps_post_id ON discussion_post_bumps(post_id, bumped_at DESC);
CREATE INDEX IF NOT EXISTS idx_discussion_post_bumps_user ON discussion_post_bumps(bumped_by);