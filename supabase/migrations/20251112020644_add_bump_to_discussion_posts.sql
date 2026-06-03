/*
  # Add Bump Feature to Discussion Posts

  1. Changes
    - Add `bumped_at` column to track when a post was last bumped
    - Add `bump_count` column to track how many times a post has been bumped
    - Add `last_bumped_by` column to track who last bumped the post
    - Add index for efficient sorting by bump time
    
  2. Purpose
    - Allow users to "bump" unanswered posts (especially questions) back to the top
    - Helps prevent good questions from being forgotten
    - Tracks bump history to prevent abuse
    
  3. Security
    - No policy changes needed - existing policies apply
*/

-- Add bumped_at column to track when post was bumped
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'discussion_posts' AND column_name = 'bumped_at'
  ) THEN
    ALTER TABLE discussion_posts ADD COLUMN bumped_at timestamptz;
  END IF;
END $$;

-- Add bump_count column to track number of bumps
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'discussion_posts' AND column_name = 'bump_count'
  ) THEN
    ALTER TABLE discussion_posts ADD COLUMN bump_count integer DEFAULT 0;
  END IF;
END $$;

-- Add last_bumped_by column to track who bumped
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'discussion_posts' AND column_name = 'last_bumped_by'
  ) THEN
    ALTER TABLE discussion_posts ADD COLUMN last_bumped_by uuid REFERENCES profiles(id);
  END IF;
END $$;

-- Add index for efficient sorting by bump time
CREATE INDEX IF NOT EXISTS idx_discussion_posts_bumped_at ON discussion_posts(bumped_at DESC NULLS LAST);

-- Add composite index for ordering posts (bumped posts first, then by created_at)
CREATE INDEX IF NOT EXISTS idx_discussion_posts_sort ON discussion_posts(
  COALESCE(bumped_at, created_at) DESC
) WHERE parent_id IS NULL;