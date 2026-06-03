/*
  # Fix requires_daily_clock to be based on employment_type

  1. Changes
    - Update ALL users to have requires_daily_clock based on employment_type
    - employment_type 'hourly' -> requires_daily_clock = true
    - employment_type 'job_time' -> requires_daily_clock = true
    - employment_type 'salary' -> requires_daily_clock = false (unless admin wants tracking)
    - Update handle_new_user trigger to set requires_daily_clock based on employment_type

  2. Important Notes
    - Both hourly and job_time users MUST have access to time clock
    - This ensures proper time tracking for payment purposes
*/

-- Update existing users based on employment_type
UPDATE profiles
SET requires_daily_clock = CASE
  WHEN employment_type IN ('hourly', 'job_time') THEN true
  ELSE false
END;

-- Update the trigger to set requires_daily_clock based on employment_type
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  default_role text := 'sales';
  default_employment_type text := 'hourly';
  tech_work_center_id uuid;
  generated_username text;
  name_for_username text;
  needs_clock boolean := false;
BEGIN
  -- Generate username from full_name or email
  name_for_username := COALESCE(new.raw_user_meta_data->>'full_name', SPLIT_PART(new.email, '@', 1));
  generated_username := LOWER(REGEXP_REPLACE(name_for_username, '[^a-zA-Z0-9]', '_', 'g'));
  
  -- Ensure username is unique by appending numbers if needed
  WHILE EXISTS (SELECT 1 FROM profiles WHERE username = generated_username) LOOP
    generated_username := generated_username || '_' || FLOOR(RANDOM() * 1000)::text;
  END LOOP;

  -- Determine employment type and clock requirement based on role
  -- Tech roles default to hourly employment which requires daily clock
  IF default_role IN ('tech', 'field_tech', 'installer', 'technician') THEN
    default_employment_type := 'hourly';
    needs_clock := true;
  ELSIF default_role = 'job_time' THEN
    default_employment_type := 'job_time';
    needs_clock := true;
  ELSE
    default_employment_type := 'salary';
    needs_clock := false;
  END IF;

  INSERT INTO public.profiles (
    id, 
    email, 
    full_name, 
    username, 
    role, 
    employment_type,
    requires_daily_clock
  )
  VALUES (
    new.id, 
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', new.email), 
    generated_username,
    default_role,
    default_employment_type,
    needs_clock
  );

  -- Auto-star tech_work_center for technicians
  IF default_role IN ('technician', 'field_tech', 'installer', 'tech', 'job_time') THEN
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
$function$;
