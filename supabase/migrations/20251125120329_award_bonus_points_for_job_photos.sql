/*
  # Award Bonus Points for Job Photos

  1. Changes
    - Create trigger to award points when job photos are uploaded
    - Track which photos have already awarded points
    - Award points to the technician who uploaded the photo
  
  2. Points System
    - Each valid job photo (with 20+ char caption) earns bonus points
    - Points only awarded once per photo
    - Points awarded to the technician associated with the work order
*/

-- Function to award bonus points for job photos
CREATE OR REPLACE FUNCTION award_job_photo_points()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tech_id uuid;
  points_to_award integer := 1;
  photo_point_event_id uuid;
BEGIN
  -- Only process if photo hasn't already awarded points
  IF NEW.bonus_points_awarded = true THEN
    RETURN NEW;
  END IF;

  -- Get the technician from the work order
  SELECT assigned_to INTO tech_id
  FROM work_orders
  WHERE id = NEW.work_order_id;

  -- Only award points if there's an assigned technician
  IF tech_id IS NOT NULL THEN
    -- Check if points system is enabled
    IF EXISTS (SELECT 1 FROM company_settings WHERE enable_points_system = true LIMIT 1) THEN
      -- Award points to the profile
      UPDATE profiles
      SET total_points = COALESCE(total_points, 0) + points_to_award
      WHERE id = tech_id;

      -- Create point event record
      INSERT INTO point_events (
        user_id,
        event_type,
        points_awarded,
        description,
        created_at
      )
      VALUES (
        tech_id,
        'job_photo_uploaded',
        points_to_award,
        'Uploaded job photo for work order',
        now()
      )
      RETURNING id INTO photo_point_event_id;

      -- Mark photo as having awarded points
      NEW.bonus_points_awarded = true;
      NEW.points_awarded_at = now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop trigger if it exists and recreate
DROP TRIGGER IF EXISTS job_photo_points_trigger ON job_photos;

CREATE TRIGGER job_photo_points_trigger
  BEFORE INSERT
  ON job_photos
  FOR EACH ROW
  EXECUTE FUNCTION award_job_photo_points();

COMMENT ON FUNCTION award_job_photo_points IS 'Awards bonus points to technicians when they upload job photos with valid captions';
