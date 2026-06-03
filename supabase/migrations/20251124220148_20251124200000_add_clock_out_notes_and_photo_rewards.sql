/*
  # Clock Out Notes and Photo Rewards System

  1. Changes
    - Make job_photos.caption required (not null)
    - Add length constraint to job_photos.caption (minimum 20 characters)
    - Add points rewards for daily notes (1 point if > 20 chars)
    - Add points rewards for job notes (1 point if > 20 chars)
    - Add points rewards for job photos (1 point per photo with valid description)
    
  2. New Tables
    - `clock_out_rewards_log` - Track points awarded for notes and photos
    
  3. Triggers
    - Award points when daily_clock_entries.notes is set during clock out
    - Award points when time_entries.notes is set during job clock out
    - Award points when job_photos are created with valid captions
    
  4. Why
    - Encourage technicians to document their work
    - Reward detailed notes and photo documentation
    - Gamify the clock-out process to improve data quality
*/

-- Create clock_out_rewards_log table to track note/photo points
CREATE TABLE IF NOT EXISTS clock_out_rewards_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id uuid REFERENCES profiles(id) NOT NULL,
  reward_type text NOT NULL CHECK (reward_type IN ('daily_note', 'job_note', 'job_photo')),
  related_id uuid NOT NULL, -- daily_clock_entry_id, time_entry_id, or job_photo_id
  points_awarded integer NOT NULL DEFAULT 1,
  note_length integer, -- For notes, track character count
  photo_description_length integer, -- For photos, track caption length
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clock_out_rewards_tech ON clock_out_rewards_log(technician_id);
CREATE INDEX IF NOT EXISTS idx_clock_out_rewards_type ON clock_out_rewards_log(reward_type);
CREATE INDEX IF NOT EXISTS idx_clock_out_rewards_related ON clock_out_rewards_log(related_id);

-- Enable RLS
ALTER TABLE clock_out_rewards_log ENABLE ROW LEVEL SECURITY;

-- Techs can view their own rewards
CREATE POLICY "Techs can view own clock out rewards"
  ON clock_out_rewards_log FOR SELECT
  TO authenticated
  USING (
    auth.uid() = technician_id
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager')
    )
  );

-- System can insert rewards (via triggers)
CREATE POLICY "System can create clock out rewards"
  ON clock_out_rewards_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Make job_photos.caption NOT NULL (with migration for existing data)
DO $$
BEGIN
  -- First, update any existing NULL captions to empty string
  UPDATE job_photos SET caption = '' WHERE caption IS NULL;
  
  -- Then make the column NOT NULL
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'job_photos' AND column_name = 'caption' AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE job_photos ALTER COLUMN caption SET NOT NULL;
  END IF;
END $$;

-- Add constraint to ensure caption is at least 20 characters
ALTER TABLE job_photos DROP CONSTRAINT IF EXISTS job_photos_caption_length_check;
ALTER TABLE job_photos ADD CONSTRAINT job_photos_caption_length_check 
  CHECK (length(trim(caption)) >= 20);

-- Function to award points for daily notes on clock out
CREATE OR REPLACE FUNCTION award_daily_note_points()
RETURNS TRIGGER AS $$
BEGIN
  -- Only award points if:
  -- 1. This is an UPDATE (not INSERT)
  -- 2. clock_out was just set (changed from NULL)
  -- 3. notes field has content > 20 characters
  -- 4. Points haven't been awarded yet for this entry
  IF TG_OP = 'UPDATE' 
     AND OLD.clock_out IS NULL 
     AND NEW.clock_out IS NOT NULL 
     AND NEW.notes IS NOT NULL 
     AND length(trim(NEW.notes)) >= 20
     AND NOT EXISTS (
       SELECT 1 FROM clock_out_rewards_log
       WHERE related_id = NEW.id AND reward_type = 'daily_note'
     )
  THEN
    -- Award 1 point
    UPDATE profiles
    SET points_earned = COALESCE(points_earned, 0) + 1
    WHERE id = NEW.technician_id;
    
    -- Log the reward
    INSERT INTO clock_out_rewards_log (
      technician_id,
      reward_type,
      related_id,
      points_awarded,
      note_length
    ) VALUES (
      NEW.technician_id,
      'daily_note',
      NEW.id,
      1,
      length(trim(NEW.notes))
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_award_daily_note_points ON daily_clock_entries;
CREATE TRIGGER trigger_award_daily_note_points
  AFTER UPDATE ON daily_clock_entries
  FOR EACH ROW
  EXECUTE FUNCTION award_daily_note_points();

-- Function to award points for job notes on job clock out
CREATE OR REPLACE FUNCTION award_job_note_points()
RETURNS TRIGGER AS $$
BEGIN
  -- Only award points if:
  -- 1. This is an UPDATE (not INSERT)
  -- 2. clock_out was just set (changed from NULL)
  -- 3. notes field has content > 20 characters
  -- 4. Points haven't been awarded yet for this entry
  IF TG_OP = 'UPDATE' 
     AND OLD.clock_out IS NULL 
     AND NEW.clock_out IS NOT NULL 
     AND NEW.notes IS NOT NULL 
     AND length(trim(NEW.notes)) >= 20
     AND NOT EXISTS (
       SELECT 1 FROM clock_out_rewards_log
       WHERE related_id = NEW.id AND reward_type = 'job_note'
     )
  THEN
    -- Award 1 point
    UPDATE profiles
    SET points_earned = COALESCE(points_earned, 0) + 1
    WHERE id = NEW.technician_id;
    
    -- Log the reward
    INSERT INTO clock_out_rewards_log (
      technician_id,
      reward_type,
      related_id,
      points_awarded,
      note_length
    ) VALUES (
      NEW.technician_id,
      'job_note',
      NEW.id,
      1,
      length(trim(NEW.notes))
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_award_job_note_points ON time_entries;
CREATE TRIGGER trigger_award_job_note_points
  AFTER UPDATE ON time_entries
  FOR EACH ROW
  EXECUTE FUNCTION award_job_note_points();

-- Function to award points for job photos with valid descriptions
CREATE OR REPLACE FUNCTION award_job_photo_points()
RETURNS TRIGGER AS $$
BEGIN
  -- Award 1 point for each photo with a valid caption (>= 20 chars)
  -- Caption is already guaranteed to be >= 20 chars due to constraint
  
  -- Award 1 point
  UPDATE profiles
  SET points_earned = COALESCE(points_earned, 0) + 1
  WHERE id = NEW.technician_id;
  
  -- Log the reward
  INSERT INTO clock_out_rewards_log (
    technician_id,
    reward_type,
    related_id,
    points_awarded,
    photo_description_length
  ) VALUES (
    NEW.technician_id,
    'job_photo',
    NEW.id,
    1,
    length(trim(NEW.caption))
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_award_job_photo_points ON job_photos;
CREATE TRIGGER trigger_award_job_photo_points
  AFTER INSERT ON job_photos
  FOR EACH ROW
  EXECUTE FUNCTION award_job_photo_points();
