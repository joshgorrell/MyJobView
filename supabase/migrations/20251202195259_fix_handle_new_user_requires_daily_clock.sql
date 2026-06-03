/*
  # Fix handle_new_user trigger to set requires_daily_clock

  1. Changes
    - Update trigger to set requires_daily_clock based on role
    - Roles requiring daily clock: tech, job_time, field_tech, installer, technician
    - All other roles default to false
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  default_role text := 'sales';
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

  -- Determine if user needs daily clock based on role
  IF default_role IN ('tech', 'job_time', 'field_tech', 'installer', 'technician') THEN
    needs_clock := true;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, username, role, requires_daily_clock)
  VALUES (
    new.id, 
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', new.email), 
    generated_username,
    default_role,
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
