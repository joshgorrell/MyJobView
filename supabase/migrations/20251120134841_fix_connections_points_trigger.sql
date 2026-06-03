/*
  # Fix connections points trigger

  1. Changes
    - Update award_points_for_connection function to use user_id instead of created_by
    - The connections table uses user_id, not created_by

  2. Notes
    - This fixes the error when creating new connections
*/

CREATE OR REPLACE FUNCTION award_points_for_connection()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  points_config RECORD;
  contact_name_text text;
BEGIN
  -- Get points configuration
  SELECT connection_logged_points INTO points_config
  FROM points_configuration
  LIMIT 1;

  -- If no config exists or points are 0, skip
  IF points_config IS NULL OR points_config.connection_logged_points = 0 THEN
    RETURN NEW;
  END IF;

  -- Get contact name for description
  SELECT COALESCE(first_name || ' ' || last_name, company_name) INTO contact_name_text
  FROM contacts
  WHERE id = NEW.contact_id;

  -- Award points using user_id instead of created_by
  INSERT INTO points_transactions (user_id, points_amount, transaction_type, reference_id, description)
  VALUES (
    NEW.user_id,
    points_config.connection_logged_points,
    'admin_adjustment',
    NEW.id,
    'Connection logged with ' || COALESCE(contact_name_text, 'contact')
  );

  RETURN NEW;
END;
$$;
