/*
  # Add error handling to handle_new_user trigger
  
  1. Changes
    - Add exception handling to capture and log specific errors
    - Make starred modules insertion non-blocking
    - Ensure profile creation always succeeds even if starred modules fail
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
  assigned_role_key text;
BEGIN
  -- Generate username from full_name or email
  BEGIN
    name_for_username := COALESCE(new.raw_user_meta_data->>'full_name', SPLIT_PART(new.email, '@', 1));
    generated_username := LOWER(REGEXP_REPLACE(name_for_username, '[^a-zA-Z0-9]', '_', 'g'));
    
    -- Ensure username is unique by appending numbers if needed
    WHILE EXISTS (SELECT 1 FROM profiles WHERE username = generated_username) LOOP
      generated_username := generated_username || '_' || FLOOR(RANDOM() * 1000)::text;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    -- Fallback username generation
    generated_username := 'user_' || FLOOR(RANDOM() * 100000)::text;
    RAISE WARNING 'Username generation failed, using fallback: %', generated_username;
  END;

  -- Insert profile (this MUST succeed)
  BEGIN
    INSERT INTO public.profiles (id, email, full_name, username, role)
    VALUES (
      new.id, 
      new.email,
      COALESCE(new.raw_user_meta_data->>'full_name', new.email), 
      generated_username,
      default_role
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to create profile: % %', SQLERRM, SQLSTATE;
  END;

  -- Get the user's assigned role (will be updated by create-user edge function)
  assigned_role_key := default_role;

  -- Auto-star tech_center for technicians (non-blocking)
  BEGIN
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
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to auto-star tech_center: % %', SQLERRM, SQLSTATE;
  END;

  -- Populate default starred modules based on role (non-blocking)
  BEGIN
    INSERT INTO user_starred_modules (user_id, module_id)
    SELECT new.id, module_id
    FROM default_starred_modules
    WHERE role = assigned_role_key
    ON CONFLICT (user_id, module_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to populate default starred modules: % %', SQLERRM, SQLSTATE;
  END;

  RETURN new;
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'handle_new_user trigger failed: % %', SQLERRM, SQLSTATE;
END;
$function$;
