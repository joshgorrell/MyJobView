/*
  # Fix handle_new_user trigger to use valid role

  1. Changes
    - Update handle_new_user() function to use 'sales' instead of 'sales_v2'
    - 'sales_v2' is not a valid role in the profiles_role_check constraint
    - This was causing database errors when creating new users

  2. Security
    - Maintains existing SECURITY DEFINER
    - No changes to RLS policies
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
$function$;