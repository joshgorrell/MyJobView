/*
  # Fix handle_new_user trigger to populate default starred modules

  1. Changes
    - Populate user_starred_modules from default_starred_modules table based on user's role
    - This ensures new users get the appropriate default starred modules for their role
    
  2. Notes
    - Default starred modules are defined in the default_starred_modules table
    - Each role has a set of modules that should be starred by default
    - This prevents users from landing on random pages they don't have access to
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

  -- Auto-star tech_work_center for technicians
  IF assigned_role_key IN ('technician', 'field_tech', 'installer', 'tech') THEN
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

  -- Populate default starred modules based on role
  INSERT INTO user_starred_modules (user_id, module_id)
  SELECT new.id, module_id
  FROM default_starred_modules
  WHERE role = assigned_role_key
  ON CONFLICT (user_id, module_id) DO NOTHING;

  RETURN new;
END;
$function$;
