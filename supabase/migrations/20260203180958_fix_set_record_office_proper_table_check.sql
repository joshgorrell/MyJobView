/*
  # Fix set_record_office_and_owner() Proper Table Check

  1. Changes
    - Update set_record_office_and_owner() to only check lead_source when on leads table
    - Use TG_TABLE_NAME with separate logic paths
    - Prevents column not found errors on other tables

  2. Security
    - Maintains existing RLS policies
    - No security impact
*/

-- Update the function with proper table-specific logic
CREATE OR REPLACE FUNCTION set_record_office_and_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  user_office uuid;
  current_user_id uuid;
  should_set_created_by boolean;
BEGIN
  -- Get the current user ID (will be NULL for anonymous)
  current_user_id := auth.uid();

  -- Determine if we should set created_by based on the table and source
  should_set_created_by := false;
  
  IF NEW.created_by IS NULL THEN
    -- For leads table, check lead_source
    IF TG_TABLE_NAME = 'leads' THEN
      -- Only set created_by if lead_source is not kiosk or website
      IF NEW.lead_source IS NULL OR NEW.lead_source NOT IN ('kiosk', 'website') THEN
        should_set_created_by := true;
      END IF;
    ELSE
      -- For other tables, always set created_by if null
      should_set_created_by := true;
    END IF;
  END IF;

  -- Set created_by if determined above
  IF should_set_created_by THEN
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
