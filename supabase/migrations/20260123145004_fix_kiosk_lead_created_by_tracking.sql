/*
  # Fix Kiosk Lead Created By Tracking

  1. Changes
    - Update set_record_office_and_owner() function to NOT auto-set created_by for kiosk leads
    - Kiosk leads should remain with NULL created_by to indicate anonymous entry
    - Manual leads continue to auto-set created_by if not specified

  2. Security
    - Preserves existing RLS policies
    - Only affects the trigger logic for lead creation
*/

-- Update the function to respect lead_source for created_by logic
CREATE OR REPLACE FUNCTION set_record_office_and_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  user_office uuid;
BEGIN
  -- Set created_by if not already set AND this is not a kiosk/website lead
  -- Kiosk and website leads should remain with NULL created_by to show they came from external sources
  IF NEW.created_by IS NULL AND (NEW.lead_source IS NULL OR NEW.lead_source NOT IN ('kiosk', 'website')) THEN
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
$$;
