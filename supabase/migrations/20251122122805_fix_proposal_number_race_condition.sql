/*
  # Fix Proposal Number Generation Race Condition

  1. Changes
    - Add advisory lock to prevent concurrent proposal number generation
    - Ensures unique proposal numbers even with simultaneous inserts
  
  2. How It Works
    - Uses pg_advisory_xact_lock to lock based on company_id
    - Lock is automatically released at transaction end
    - Prevents race condition where two inserts see same MAX number
*/

-- Drop and recreate the function with proper locking
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
    -- This ensures only one proposal number is generated at a time per company
    lock_key := ('x' || substr(md5(NEW.company_id::text), 1, 15))::bit(60)::bigint;
    
    -- Acquire advisory lock (automatically released at transaction end)
    PERFORM pg_advisory_xact_lock(lock_key);
    
    -- Get current year
    year_prefix := to_char(CURRENT_DATE, 'YYYY');
    
    -- Find the highest number for this year and company
    SELECT COALESCE(
      MAX(
        CAST(
          SUBSTRING(proposal_number FROM 'PROP-' || year_prefix || '-(\\d+)') 
          AS INTEGER
        )
      ), 0
    ) + 1
    INTO next_number
    FROM proposals
    WHERE company_id = NEW.company_id
      AND proposal_number LIKE 'PROP-' || year_prefix || '-%';
    
    -- Generate the new proposal number
    new_proposal_number := 'PROP-' || year_prefix || '-' || LPAD(next_number::text, 4, '0');
    
    NEW.proposal_number := new_proposal_number;
  END IF;
  
  RETURN NEW;
END;
$$;
