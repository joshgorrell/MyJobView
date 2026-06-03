/*
  # Fix profile creation trigger role

  1. Changes
    - Update handle_new_user() function to use 'sales' instead of 'sales_rep'
    - This matches the valid role values used throughout the application
  
  2. Security
    - Maintains existing SECURITY DEFINER
    - No changes to RLS policies
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  base_username text;
  final_username text;
  counter int := 0;
BEGIN
  -- Get full_name from metadata or use email prefix
  base_username := LOWER(REGEXP_REPLACE(
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    '[^a-zA-Z0-9]', '', 'g'
  ));

  -- Ensure we have at least something
  IF base_username = '' OR base_username IS NULL THEN
    base_username := 'user' || floor(random() * 10000)::text;
  END IF;

  final_username := base_username;

  -- Check for uniqueness and append number if needed
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = final_username) LOOP
    counter := counter + 1;
    final_username := base_username || counter::text;
  END LOOP;

  INSERT INTO public.profiles (id, email, full_name, username, role, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    final_username,
    'sales',
    true
  );

  RETURN NEW;
END;
$function$;