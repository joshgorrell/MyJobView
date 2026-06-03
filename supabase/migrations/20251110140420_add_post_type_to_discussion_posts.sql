/*
  # Add Post Type to Discussion Posts

  1. Changes
    - Add `post_type` column to `discussion_posts` table
      - Type: text with check constraint
      - Values: 'task', 'question', 'general'
      - Not null, no default (forces user selection)
  
  2. Notes
    - Users must explicitly choose a post type when creating posts
    - This helps categorize and filter discussions
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'discussion_posts' AND column_name = 'post_type'
  ) THEN
    ALTER TABLE discussion_posts 
    ADD COLUMN post_type text NOT NULL DEFAULT 'general'
    CHECK (post_type IN ('task', 'question', 'general'));
  END IF;
END $$;
