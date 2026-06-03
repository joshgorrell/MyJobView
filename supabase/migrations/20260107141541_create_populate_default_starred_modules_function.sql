/*
  # Create function to populate default starred modules

  1. New Function
    - populate_default_starred_modules(p_user_id, p_role)
    - Populates user_starred_modules from default_starred_modules based on role
    - Called after user creation and role assignment

  2. Security
    - SECURITY DEFINER to allow inserting into user_starred_modules
    - Only inserts for the specified user
*/

CREATE OR REPLACE FUNCTION public.populate_default_starred_modules(
  p_user_id uuid,
  p_role text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Clear any existing starred modules for this user (in case of role change)
  DELETE FROM user_starred_modules WHERE user_id = p_user_id;

  -- Populate with default starred modules for the role
  INSERT INTO user_starred_modules (user_id, module_id)
  SELECT p_user_id, module_id
  FROM default_starred_modules
  WHERE role = p_role
  ON CONFLICT (user_id, module_id) DO NOTHING;
END;
$function$;
