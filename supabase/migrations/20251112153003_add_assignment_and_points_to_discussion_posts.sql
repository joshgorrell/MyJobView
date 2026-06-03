/*
  # Add Assignment and Points System to Discussion Posts

  1. Changes to discussion_posts table
    - Add `assigned_to` column (uuid, references profiles)
    - Add `points` column (integer, points reward for completing task/answering question)
    - Add `completed_by` column (uuid, references profiles - who completed/answered)
    - Add `completed_at` column (timestamptz, when it was completed/answered)
    - Add `is_completed` column (boolean, completion status)
    - Add indexes for efficient querying

  2. Purpose
    - Allow Tasks and Questions to be assigned to specific users via @mentions
    - Support @anyone assignment (assigned_to remains null)
    - Track who completes tasks or answers questions
    - Reward users with points when they complete assignments
    - Show completion status on posts

  3. Security
    - No policy changes needed - existing policies apply
*/

-- Add assigned_to column for task/question assignment
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'discussion_posts' AND column_name = 'assigned_to'
  ) THEN
    ALTER TABLE discussion_posts ADD COLUMN assigned_to uuid REFERENCES profiles(id);
  END IF;
END $$;

-- Add points column for reward amount
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'discussion_posts' AND column_name = 'points'
  ) THEN
    ALTER TABLE discussion_posts ADD COLUMN points integer DEFAULT 10;
  END IF;
END $$;

-- Add completed_by column to track who completed it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'discussion_posts' AND column_name = 'completed_by'
  ) THEN
    ALTER TABLE discussion_posts ADD COLUMN completed_by uuid REFERENCES profiles(id);
  END IF;
END $$;

-- Add completed_at column to track when it was completed
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'discussion_posts' AND column_name = 'completed_at'
  ) THEN
    ALTER TABLE discussion_posts ADD COLUMN completed_at timestamptz;
  END IF;
END $$;

-- Add is_completed column for quick filtering
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'discussion_posts' AND column_name = 'is_completed'
  ) THEN
    ALTER TABLE discussion_posts ADD COLUMN is_completed boolean DEFAULT false;
  END IF;
END $$;

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_discussion_posts_assigned_to ON discussion_posts(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_discussion_posts_completed ON discussion_posts(is_completed, post_type);
CREATE INDEX IF NOT EXISTS idx_discussion_posts_completed_by ON discussion_posts(completed_by) WHERE completed_by IS NOT NULL;