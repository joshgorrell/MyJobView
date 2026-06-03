/*
  # Fix Profile Creation Trigger to Include Username

  1. Changes
    - Update the handle_new_user() function to generate a username when creating profiles
    - Username is generated from full_name (or email prefix) by removing non-alphanumeric chars and converting to lowercase
    - Handles username uniqueness by appending a random number if needed

  2. Security
    - Function runs with SECURITY DEFINER to bypass RLS
    - Only affects new user signups
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
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
    'sales_rep',
    true
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
