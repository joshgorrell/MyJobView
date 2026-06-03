/*
  # Add Private Discussions

  1. Changes
    - Add `is_private` boolean column to `discussion_posts` table
      - Defaults to false (public discussions)
      - When true, only mentioned users and the post creator can view
  
  2. Security
    - Drop existing "Anyone can view discussion posts" policy
    - Add new policy for public posts (viewable by all authenticated users)
    - Add new policy for private posts (viewable only by creator and mentioned users)
  
  3. Notes
    - Private posts require at least one mention to be useful
    - Creator can always see their own private posts
    - Mentioned users can see private posts they're mentioned in
    - mentions array stores UUIDs as text, need to cast for comparison
*/

-- Add is_private column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'discussion_posts' AND column_name = 'is_private'
  ) THEN
    ALTER TABLE discussion_posts ADD COLUMN is_private boolean DEFAULT false NOT NULL;
  END IF;
END $$;

-- Create index for private posts filtering
CREATE INDEX IF NOT EXISTS idx_discussion_posts_is_private ON discussion_posts(is_private);

-- Drop the old "Anyone can view discussion posts" policy
DROP POLICY IF EXISTS "Anyone can view discussion posts" ON discussion_posts;

-- Create new policy for public posts
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'discussion_posts' AND policyname = 'Authenticated users can view public posts'
  ) THEN
    CREATE POLICY "Authenticated users can view public posts"
      ON discussion_posts FOR SELECT
      TO authenticated
      USING (is_private = false);
  END IF;
END $$;

-- Create new policy for private posts (creator and mentioned users only)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'discussion_posts' AND policyname = 'Users can view private posts they are part of'
  ) THEN
    CREATE POLICY "Users can view private posts they are part of"
      ON discussion_posts FOR SELECT
      TO authenticated
      USING (
        is_private = true 
        AND (
          auth.uid() = user_id 
          OR auth.uid()::text = ANY(mentions)
        )
      );
  END IF;
END $$;
