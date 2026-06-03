/*
  # Fix Proposal Number Generation - Remove Office Assignments Reference

  1. Changes
    - Update generate_proposal_number() function to only use profiles.office_id
    - Remove reference to non-existent office_assignments table
    - Maintain the same PRO-##-##### format
*/

-- Drop and recreate the function without office_assignments reference
DROP FUNCTION IF EXISTS generate_proposal_number() CASCADE;

CREATE OR REPLACE FUNCTION generate_proposal_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  office_num text;
  next_number integer;
  new_proposal_number text;
  lock_key bigint;
  user_office_id uuid;
BEGIN
  -- Only generate if proposal_number is not provided
  IF NEW.proposal_number IS NULL OR NEW.proposal_number = '' THEN
    -- Get the user's office ID from profiles
    SELECT office_id INTO user_office_id
    FROM profiles
    WHERE id = NEW.created_by;

    -- Determine office number based on office_id
    -- Default to '01' if no office found
    IF user_office_id IS NULL THEN
      office_num := '01';
    ELSE
      -- Get office number from company_offices table
      -- Offices should have a sequence number or we'll derive from creation order
      SELECT LPAD(
        COALESCE(
          (SELECT COUNT(*) + 1
           FROM company_offices co2
           WHERE co2.company_id = co.company_id
           AND co2.created_at <= co.created_at),
          1
        )::text,
        2,
        '0'
      )
      INTO office_num
      FROM company_offices co
      WHERE co.id = user_office_id;

      -- If still null, default to '01'
      IF office_num IS NULL THEN
        office_num := '01';
      END IF;
    END IF;

    -- Create a lock key from company_id and office_num hash
    lock_key := ('x' || substr(md5(NEW.company_id::text || office_num), 1, 15))::bit(60)::bigint;

    -- Acquire advisory lock (automatically released at transaction end)
    PERFORM pg_advisory_xact_lock(lock_key);

    -- Find the highest number for this office
    SELECT COALESCE(MAX(
      CASE
        WHEN proposal_number ~ ('^PRO-' || office_num || '-[0-9]+$')
        THEN (regexp_match(proposal_number, '^PRO-' || office_num || '-([0-9]+)$'))[1]::integer
        ELSE 0
      END
    ), 24999) + 1
    INTO next_number
    FROM proposals
    WHERE company_id = NEW.company_id
      AND proposal_number LIKE 'PRO-' || office_num || '-%';

    -- Ensure we start at 25000 minimum
    IF next_number < 25000 THEN
      next_number := 25000;
    END IF;

    -- Generate the new proposal number: PRO-##-#####
    new_proposal_number := 'PRO-' || office_num || '-' || next_number::text;

    NEW.proposal_number := new_proposal_number;
  END IF;

  RETURN NEW;
END;
$$;

-- Recreate the trigger
DROP TRIGGER IF EXISTS trigger_generate_proposal_number ON proposals;
CREATE TRIGGER trigger_generate_proposal_number
  BEFORE INSERT ON proposals
  FOR EACH ROW
  EXECUTE FUNCTION generate_proposal_number();
