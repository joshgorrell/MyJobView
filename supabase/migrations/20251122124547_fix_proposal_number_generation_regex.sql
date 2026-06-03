/*
  # Fix Proposal Number Generation Regex

  1. Changes
    - Fix regex pattern to properly extract proposal numbers
    - Use a simpler, more reliable approach
    - Ensure numbers increment correctly
  
  2. Security
    - Maintains advisory lock for race condition prevention
    - Security definer with explicit search path
*/

-- Drop and recreate the function with corrected logic
CREATE OR REPLACE FUNCTION generate_proposal_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  year_prefix text;
  next_number integer;
  new_proposal_number text;
  lock_key bigint;
BEGIN
  -- Only generate if proposal_number is not provided
  IF NEW.proposal_number IS NULL OR NEW.proposal_number = '' THEN
    -- Create a lock key from company_id hash
    lock_key := ('x' || substr(md5(NEW.company_id::text), 1, 15))::bit(60)::bigint;
    
    -- Acquire advisory lock (automatically released at transaction end)
    PERFORM pg_advisory_xact_lock(lock_key);
    
    -- Get current year
    year_prefix := to_char(CURRENT_DATE, 'YYYY');
    
    -- Find the highest number for this year and company
    -- Use a more reliable approach: split on hyphens and cast the last part
    SELECT COALESCE(MAX(
      CASE 
        WHEN proposal_number ~ ('^PROP-' || year_prefix || '-[0-9]+$')
        THEN (regexp_match(proposal_number, '^PROP-' || year_prefix || '-([0-9]+)$'))[1]::integer
        ELSE 0
      END
    ), 0) + 1
    INTO next_number
    FROM proposals
    WHERE company_id = NEW.company_id
      AND proposal_number LIKE 'PROP-' || year_prefix || '-%';
    
    -- Generate the new proposal number with zero-padding
    new_proposal_number := 'PROP-' || year_prefix || '-' || LPAD(next_number::text, 4, '0');
    
    NEW.proposal_number := new_proposal_number;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Ensure the trigger is properly set up
DROP TRIGGER IF EXISTS trigger_generate_proposal_number ON proposals;

CREATE TRIGGER trigger_generate_proposal_number
  BEFORE INSERT ON proposals
  FOR EACH ROW
  EXECUTE FUNCTION generate_proposal_number();
