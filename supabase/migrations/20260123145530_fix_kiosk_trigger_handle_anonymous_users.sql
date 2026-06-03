/*
  # Fix Kiosk Trigger for Anonymous Users

  1. Changes
    - Update set_record_office_and_owner() to properly handle NULL auth.uid()
    - Skip office lookup for anonymous users entirely
    - Ensures kiosk submissions work without authentication

  2. Security
    - Maintains existing RLS policies
    - Only affects trigger behavior for anonymous submissions
*/

-- Update the function to handle anonymous users properly
CREATE OR REPLACE FUNCTION set_record_office_and_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  user_office uuid;
  current_user_id uuid;
BEGIN
  -- Get the current user ID (will be NULL for anonymous)
  current_user_id := auth.uid();

  -- Set created_by if not already set AND this is not a kiosk/website lead
  -- Kiosk and website leads should remain with NULL created_by to show they came from external sources
  IF NEW.created_by IS NULL AND (NEW.lead_source IS NULL OR NEW.lead_source NOT IN ('kiosk', 'website')) THEN
    NEW.created_by := current_user_id;
  END IF;

  -- Only attempt office lookup if we have an authenticated user
  IF current_user_id IS NOT NULL AND NEW.office_id IS NULL THEN
    -- Get user's primary office
    SELECT primary_office_id INTO user_office
    FROM profiles
    WHERE id = current_user_id;

    -- Only set if user has a primary office (allow NULL if they don't)
    IF user_office IS NOT NULL THEN
      NEW.office_id := user_office;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
