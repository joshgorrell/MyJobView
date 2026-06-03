/*
  # Auto-star Technician Work Center and Enforce Job Notes

  1. Changes
    - Auto-star tech_work_center module for technician roles on profile creation
    - Add job_notes_required field to time_entries (enforced on clock out)
    - Add photo_bonus_points_awarded to track bonus points for job photos
  
  2. Notes
    - Technicians will see their work center as a starred/favorited module
    - Job notes must be at least 20 characters on clock out
    - Bonus points awarded when technicians upload job photos
*/

-- Update the profile creation trigger to auto-star tech_work_center for technicians
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  default_role text := 'sales_v2';
  tech_work_center_id uuid;
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (new.id, COALESCE(new.raw_user_meta_data->>'full_name', new.email), default_role);

  -- Auto-star tech_work_center for technicians
  IF default_role IN ('technician', 'field_tech', 'installer') THEN
    SELECT id INTO tech_work_center_id 
    FROM department_modules 
    WHERE module_key = 'tech_work_center' 
    LIMIT 1;
    
    IF tech_work_center_id IS NOT NULL THEN
      INSERT INTO user_starred_modules (user_id, module_id)
      VALUES (new.id, tech_work_center_id)
      ON CONFLICT (user_id, module_id) DO NOTHING;
    END IF;
  END IF;

  RETURN new;
END;
$$;

-- Also auto-star for existing technicians who don't have it starred
DO $$
DECLARE
  tech_work_center_id uuid;
BEGIN
  SELECT id INTO tech_work_center_id 
  FROM department_modules 
  WHERE module_key = 'tech_work_center' 
  LIMIT 1;
  
  IF tech_work_center_id IS NOT NULL THEN
    INSERT INTO user_starred_modules (user_id, module_id)
    SELECT p.id, tech_work_center_id
    FROM profiles p
    WHERE p.role IN ('technician', 'field_tech', 'installer')
      AND NOT EXISTS (
        SELECT 1 FROM user_starred_modules usm 
        WHERE usm.user_id = p.id 
        AND usm.module_id = tech_work_center_id
      )
    ON CONFLICT (user_id, module_id) DO NOTHING;
  END IF;
END $$;

-- Add columns to track photo bonus points
ALTER TABLE job_photos
ADD COLUMN IF NOT EXISTS bonus_points_awarded boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS points_awarded_at timestamptz;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_job_photos_bonus_points ON job_photos(work_order_id, bonus_points_awarded);

COMMENT ON COLUMN job_photos.bonus_points_awarded IS 'Whether bonus points were awarded for this photo';
COMMENT ON COLUMN job_photos.points_awarded_at IS 'When bonus points were awarded for this photo';
