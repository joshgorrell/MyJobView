/*
  # Fix Points Trigger for Anonymous Leads

  1. Changes
    - Update award_points_for_lead_created() to skip anonymous leads
    - Only award points when created_by is NOT NULL
    - Prevents errors when kiosk/website leads are created

  2. Security
    - Maintains existing RLS policies
    - Only affects point awards for lead creation
*/

-- Update the function to skip anonymous leads
CREATE OR REPLACE FUNCTION award_points_for_lead_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  points_config RECORD;
BEGIN
  -- Skip if this is an anonymous lead (created_by is NULL)
  IF NEW.created_by IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get points configuration
  SELECT lead_created_points INTO points_config
  FROM points_configuration
  LIMIT 1;

  -- If no config exists or points are 0, skip
  IF points_config IS NULL OR points_config.lead_created_points = 0 THEN
    RETURN NEW;
  END IF;

  -- Award points
  INSERT INTO points_transactions (user_id, points_amount, transaction_type, reference_id, description)
  VALUES (
    NEW.created_by,
    points_config.lead_created_points,
    'admin_adjustment',
    NEW.id,
    'Lead created: ' || COALESCE(NEW.company_name, 'New Lead')
  );

  RETURN NEW;
END;
$$;
