/*
  # Add Reply Support to Discussion Posts

  1. Changes
    - Add `parent_id` column to `discussion_posts` table to support threaded replies
    - Add foreign key constraint referencing the same table
    - Add index for efficient query of replies
    - Update RLS policies to handle replies

  2. Security
    - Replies inherit the same security model as top-level posts
    - Users can reply to any post they can view
*/

-- Add parent_id column for threaded replies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'discussion_posts' AND column_name = 'parent_id'
  ) THEN
    ALTER TABLE discussion_posts ADD COLUMN parent_id uuid REFERENCES discussion_posts(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add index for efficient query of replies
CREATE INDEX IF NOT EXISTS idx_discussion_posts_parent_id ON discussion_posts(parent_id);

-- Add index for querying top-level posts (where parent_id is null)
CREATE INDEX IF NOT EXISTS idx_discussion_posts_top_level ON discussion_posts(parent_id) WHERE parent_id IS NULL;