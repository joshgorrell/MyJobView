/*
  # Fix handle_new_user trigger to include email and username

  1. Changes
    - Add email and username to profile insert (both are NOT NULL columns)
    - Generate username from full_name or email
    - This fixes "Database error creating new user" when creating users

  2. Notes
    - email and username columns are NOT NULL with no defaults
    - Trigger was failing because it wasn't providing these required fields
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
BEGIN
  -- Generate username from full_name or email
  name_for_username := COALESCE(new.raw_user_meta_data->>'full_name', SPLIT_PART(new.email, '@', 1));
  generated_username := LOWER(REGEXP_REPLACE(name_for_username, '[^a-zA-Z0-9]', '_', 'g'));
  
  -- Ensure username is unique by appending numbers if needed
  WHILE EXISTS (SELECT 1 FROM profiles WHERE username = generated_username) LOOP
    generated_username := generated_username || '_' || FLOOR(RANDOM() * 1000)::text;
  END LOOP;

  INSERT INTO public.profiles (id, email, full_name, username, role)
  VALUES (
    new.id, 
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', new.email), 
    generated_username,
    default_role
  );

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
$function$;
