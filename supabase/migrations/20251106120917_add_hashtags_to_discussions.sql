/*
  # Add Hashtags to Discussion Posts

  1. Changes
    - Add `hashtags` array column to discussion_posts table
    - Create an index on hashtags for efficient filtering
  
  2. Notes
    - Hashtags will be stored as an array of strings (lowercase)
    - Used for categorizing and filtering discussions
    - Examples: ["sales", "urgent", "followup", "won"]
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'discussion_posts' AND column_name = 'hashtags'
  ) THEN
    ALTER TABLE discussion_posts ADD COLUMN hashtags text[] DEFAULT '{}';
    
    CREATE INDEX IF NOT EXISTS idx_discussion_posts_hashtags ON discussion_posts USING GIN(hashtags);
  END IF;
END $$;
