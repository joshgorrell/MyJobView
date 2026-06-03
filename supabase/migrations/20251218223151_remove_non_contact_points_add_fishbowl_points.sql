/*
  # Clean Up Points System - Contact Activities Only

  1. Changes
    - Remove all non-contact-related point triggers and functions:
      - Clock in/out points
      - Job photo points
      - Job note points
      - Daily note points
    - Add automatic point awards for fishbowl/discussion posts
    - Ensure only these 4 activities award points:
      1. New contacts
      2. New leads
      3. New connections
      4. New fishbowl entries (discussion posts)

  2. Removed Triggers
    - trigger_award_clock_in_points
    - trigger_award_daily_note_points
    - trigger_award_job_note_points
    - trigger_award_job_photo_points
    - job_photo_points_trigger

  3. New System
    - Add fishbowl_post_points to points_configuration
    - Auto-award points when discussion posts are created
*/

-- Add fishbowl post points configuration
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'points_configuration' AND column_name = 'fishbowl_post_points'
  ) THEN
    ALTER TABLE points_configuration ADD COLUMN fishbowl_post_points integer DEFAULT 5 NOT NULL CHECK (fishbowl_post_points >= 0);
  END IF;
END $$;

-- Drop all non-contact point triggers
DROP TRIGGER IF EXISTS trigger_award_clock_in_points ON daily_clock_entries;
DROP TRIGGER IF EXISTS trigger_award_daily_note_points ON daily_clock_entries;
DROP TRIGGER IF EXISTS trigger_award_job_note_points ON time_entries;
DROP TRIGGER IF EXISTS trigger_award_job_photo_points ON job_photos;
DROP TRIGGER IF EXISTS job_photo_points_trigger ON job_photos;

-- Drop the functions (they won't be used anymore)
DROP FUNCTION IF EXISTS award_clock_in_points();
DROP FUNCTION IF EXISTS award_daily_note_points();
DROP FUNCTION IF EXISTS award_job_note_points();
DROP FUNCTION IF EXISTS award_job_photo_points();

-- Function to award points for fishbowl posts
CREATE OR REPLACE FUNCTION award_points_for_fishbowl_post()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  points_config RECORD;
BEGIN
  -- Get points configuration
  SELECT fishbowl_post_points INTO points_config
  FROM points_configuration
  LIMIT 1;

  -- If no config exists or points are 0, skip
  IF points_config IS NULL OR points_config.fishbowl_post_points = 0 THEN
    RETURN NEW;
  END IF;

  -- Only award points for public posts (not private)
  IF NEW.is_private = false THEN
    -- Award points
    INSERT INTO points_transactions (user_id, points_amount, transaction_type, reference_id, description)
    VALUES (
      NEW.author_id,
      points_config.fishbowl_post_points,
      'admin_adjustment',
      NEW.id,
      'Fishbowl post created'
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger for fishbowl posts
DROP TRIGGER IF EXISTS trigger_award_points_fishbowl_post ON discussion_posts;
CREATE TRIGGER trigger_award_points_fishbowl_post
  AFTER INSERT ON discussion_posts
  FOR EACH ROW
  EXECUTE FUNCTION award_points_for_fishbowl_post();

-- Set default value for fishbowl post points
UPDATE points_configuration
SET fishbowl_post_points = 5
WHERE fishbowl_post_points IS NULL;

COMMENT ON FUNCTION award_points_for_fishbowl_post IS 'Awards points when users create fishbowl/discussion posts (public posts only)';
