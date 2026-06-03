/*
  # Add comment_public flag to customer_satisfaction

  1. Changes
    - `customer_satisfaction` table: add `comment_public` boolean column (default false)
      - When true, the comment is visible to all authenticated users
      - When false (default), the comment is only visible to admins
    - Add index for performance when filtering by visibility
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customer_satisfaction' AND column_name = 'comment_public'
  ) THEN
    ALTER TABLE customer_satisfaction ADD COLUMN comment_public boolean NOT NULL DEFAULT false;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_customer_satisfaction_comment_public
  ON customer_satisfaction(comment_public)
  WHERE comment IS NOT NULL;
