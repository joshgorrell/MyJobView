/*
  # Add Points System to Profiles

  1. Changes to profiles table
    - Add `points_earned` column (integer, default 0)
    - Tracks total points earned by users for completing tasks and answering questions

  2. Purpose
    - Enable gamification through points rewards
    - Track user contributions and achievements
    - Display points in user profiles and leaderboards

  3. Security
    - No policy changes needed - existing policies apply
*/

-- Add points_earned column to profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'points_earned'
  ) THEN
    ALTER TABLE profiles ADD COLUMN points_earned integer DEFAULT 0 NOT NULL;
  END IF;
END $$;

-- Create index for leaderboard queries
CREATE INDEX IF NOT EXISTS idx_profiles_points_earned ON profiles(points_earned DESC);