/*
  # Fix Points Trigger for Anonymous Contact Creation

  1. Changes
    - Update award_points_for_contact function to skip awarding points when created_by is NULL
    - This prevents errors when anonymous users create contacts during VIP signup

  2. Security
    - Function still runs with SECURITY DEFINER
    - Only awards points when there's a valid user_id (created_by)
*/

-- Update function to skip anonymous contact creations
CREATE OR REPLACE FUNCTION award_points_for_contact()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  points_config RECORD;
BEGIN
  -- Skip if contact was created anonymously (no created_by user)
  IF NEW.created_by IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get points configuration
  SELECT contact_created_points INTO points_config
  FROM points_configuration
  LIMIT 1;

  -- If no config exists or points are 0, skip
  IF points_config IS NULL OR points_config.contact_created_points = 0 THEN
    RETURN NEW;
  END IF;

  -- Award points
  INSERT INTO points_transactions (user_id, points_amount, transaction_type, reference_id, description)
  VALUES (
    NEW.created_by,
    points_config.contact_created_points,
    'admin_adjustment',
    NEW.id,
    'Contact created: ' || COALESCE(NEW.contact_name, 'New Contact')
  );

  RETURN NEW;
END;
$$;
