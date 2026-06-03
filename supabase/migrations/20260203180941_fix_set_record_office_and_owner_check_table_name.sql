/*
  # Fix set_record_office_and_owner() to Check Table Name

  1. Changes
    - Update set_record_office_and_owner() to only check lead_source on leads table
    - Use TG_TABLE_NAME to conditionally check lead_source field
    - Prevents errors when trigger fires on tables without lead_source column

  2. Security
    - Maintains existing RLS policies
    - No security impact, just fixes runtime error
*/

-- Update the function to check table name before accessing lead_source
CREATE OR REPLACE FUNCTION set_record_office_and_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  user_office uuid;
  current_user_id uuid;
  record_lead_source text;
BEGIN
  -- Get the current user ID (will be NULL for anonymous)
  current_user_id := auth.uid();

  -- Only check lead_source if this trigger is being called on the leads table
  -- Extract lead_source from NEW if the column exists
  IF TG_TABLE_NAME = 'leads' THEN
    record_lead_source := NEW.lead_source;
  ELSE
    record_lead_source := NULL;
  END IF;

  -- Set created_by if not already set AND this is not a kiosk/website lead
  -- Kiosk and website leads should remain with NULL created_by to show they came from external sources
  IF NEW.created_by IS NULL AND (record_lead_source IS NULL OR record_lead_source NOT IN ('kiosk', 'website')) THEN
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
