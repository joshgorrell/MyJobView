/*
  # Fix set_record_office_and_owner function to handle NULL office_id

  1. Updates
    - Allow office_id to remain NULL if user has no primary_office_id
    - This fixes the "office_id does not exist" error when creating proposals
    
  2. Changes
    - Modified function to only set office_id if user has a primary office
    - Removed the requirement for office_id to always be set
*/

CREATE OR REPLACE FUNCTION set_record_office_and_owner()
RETURNS TRIGGER AS $$
DECLARE
  user_office uuid;
BEGIN
  -- Set created_by if not already set
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;

  -- Set office_id if not already set and user has a primary office
  IF NEW.office_id IS NULL THEN
    -- Get user's primary office
    SELECT primary_office_id INTO user_office
    FROM profiles
    WHERE id = auth.uid();

    -- Only set if user has a primary office (allow NULL if they don't)
    IF user_office IS NOT NULL THEN
      NEW.office_id := user_office;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';
