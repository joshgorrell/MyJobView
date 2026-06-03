/*
  # Fix Tech Role Default Starred Modules

  1. Changes
    - Fix handle_new_user trigger to use correct module_key 'tech_center' instead of 'tech_work_center'
    - The module was renamed but the trigger wasn't updated
    
  2. Notes
    - This was causing the trigger to fail when creating new technician users
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  default_role text := 'sales';
  tech_center_id uuid;
  generated_username text;
  name_for_username text;
  assigned_role_id uuid;
  assigned_role_key text;
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

  -- Get the user's assigned role (will be updated by create-user edge function)
  -- For now, use the default_role
  assigned_role_key := default_role;

  -- Auto-star tech_center for technicians
  IF assigned_role_key IN ('technician', 'field_tech', 'installer', 'tech') THEN
    SELECT id INTO tech_center_id 
    FROM department_modules 
    WHERE module_key = 'tech_center'
    LIMIT 1;

    IF tech_center_id IS NOT NULL THEN
      INSERT INTO user_starred_modules (user_id, module_id)
      VALUES (new.id, tech_center_id)
      ON CONFLICT (user_id, module_id) DO NOTHING;
    END IF;
  END IF;

  -- Populate default starred modules based on role
  INSERT INTO user_starred_modules (user_id, module_id)
  SELECT new.id, module_id
  FROM default_starred_modules
  WHERE role = assigned_role_key
  ON CONFLICT (user_id, module_id) DO NOTHING;

  RETURN new;
END;
$function$;