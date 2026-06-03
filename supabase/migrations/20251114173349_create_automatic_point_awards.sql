/*
  # Create Automatic Point Award System

  1. Changes
    - Add point values to points_configuration for different activities:
      - contact_created_points (default 5)
      - connection_logged_points (default 10)
      - lead_created_points (default 20)
      - lead_claimed_points (default 15)
      - lead_converted_points (default 50)
    
  2. New Functions
    - Auto-award points when contacts are created
    - Auto-award points when connections are logged
    - Auto-award points when leads are created
    - Auto-award points when leads are claimed
    - Auto-award points when leads are converted
    
  3. Triggers
    - Trigger on contacts insert
    - Trigger on connections insert
    - Trigger on leads insert
    - Trigger on leads update (status change to claimed/converted)

  4. Security
    - Functions run with SECURITY DEFINER to ensure proper point awards
    - Only affects authenticated users with valid profiles
*/

-- Add new point configuration fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'points_configuration' AND column_name = 'contact_created_points'
  ) THEN
    ALTER TABLE points_configuration ADD COLUMN contact_created_points integer DEFAULT 5 NOT NULL CHECK (contact_created_points >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'points_configuration' AND column_name = 'connection_logged_points'
  ) THEN
    ALTER TABLE points_configuration ADD COLUMN connection_logged_points integer DEFAULT 10 NOT NULL CHECK (connection_logged_points >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'points_configuration' AND column_name = 'lead_created_points'
  ) THEN
    ALTER TABLE points_configuration ADD COLUMN lead_created_points integer DEFAULT 20 NOT NULL CHECK (lead_created_points >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'points_configuration' AND column_name = 'lead_claimed_points'
  ) THEN
    ALTER TABLE points_configuration ADD COLUMN lead_claimed_points integer DEFAULT 15 NOT NULL CHECK (lead_claimed_points >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'points_configuration' AND column_name = 'lead_converted_points'
  ) THEN
    ALTER TABLE points_configuration ADD COLUMN lead_converted_points integer DEFAULT 50 NOT NULL CHECK (lead_converted_points >= 0);
  END IF;
END $$;

-- Function to award points for contact creation
CREATE OR REPLACE FUNCTION award_points_for_contact()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  points_config RECORD;
BEGIN
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

-- Function to award points for connection logging
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
  SELECT contact_name INTO contact_name_text
  FROM contacts
  WHERE id = NEW.contact_id;

  -- Award points
  INSERT INTO points_transactions (user_id, points_amount, transaction_type, reference_id, description)
  VALUES (
    NEW.created_by,
    points_config.connection_logged_points,
    'admin_adjustment',
    NEW.id,
    'Connection logged with ' || COALESCE(contact_name_text, 'contact')
  );

  RETURN NEW;
END;
$$;

-- Function to award points for lead creation
CREATE OR REPLACE FUNCTION award_points_for_lead_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  points_config RECORD;
BEGIN
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

-- Function to award points for lead status changes
CREATE OR REPLACE FUNCTION award_points_for_lead_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  points_config RECORD;
  points_to_award integer;
  award_description text;
BEGIN
  -- Get points configuration
  SELECT lead_claimed_points, lead_converted_points INTO points_config
  FROM points_configuration
  LIMIT 1;

  -- If no config exists, skip
  IF points_config IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check for lead claimed (status changed from unclaimed to claimed)
  IF OLD.status = 'unclaimed' AND NEW.status = 'claimed' AND NEW.assigned_to IS NOT NULL THEN
    IF points_config.lead_claimed_points > 0 THEN
      INSERT INTO points_transactions (user_id, points_amount, transaction_type, reference_id, description)
      VALUES (
        NEW.assigned_to,
        points_config.lead_claimed_points,
        'admin_adjustment',
        NEW.id,
        'Lead claimed: ' || COALESCE(NEW.company_name, 'Lead')
      );
    END IF;
  END IF;

  -- Check for lead converted (status changed to converted/won)
  IF OLD.status != 'converted' AND NEW.status = 'converted' AND NEW.assigned_to IS NOT NULL THEN
    IF points_config.lead_converted_points > 0 THEN
      INSERT INTO points_transactions (user_id, points_amount, transaction_type, reference_id, description)
      VALUES (
        NEW.assigned_to,
        points_config.lead_converted_points,
        'admin_adjustment',
        NEW.id,
        'Lead converted: ' || COALESCE(NEW.company_name, 'Lead')
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Create triggers
DROP TRIGGER IF EXISTS trigger_award_points_contact ON contacts;
CREATE TRIGGER trigger_award_points_contact
  AFTER INSERT ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION award_points_for_contact();

DROP TRIGGER IF EXISTS trigger_award_points_connection ON connections;
CREATE TRIGGER trigger_award_points_connection
  AFTER INSERT ON connections
  FOR EACH ROW
  EXECUTE FUNCTION award_points_for_connection();

DROP TRIGGER IF EXISTS trigger_award_points_lead_created ON leads;
CREATE TRIGGER trigger_award_points_lead_created
  AFTER INSERT ON leads
  FOR EACH ROW
  EXECUTE FUNCTION award_points_for_lead_created();

DROP TRIGGER IF EXISTS trigger_award_points_lead_status ON leads;
CREATE TRIGGER trigger_award_points_lead_status
  AFTER UPDATE ON leads
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION award_points_for_lead_status_change();