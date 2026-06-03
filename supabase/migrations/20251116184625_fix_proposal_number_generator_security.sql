/*
  # Fix Proposal Number Generator Security

  ## Summary
  Updates the generate_proposal_number function to use SECURITY DEFINER
  so it can query the proposals table without RLS restrictions during INSERT.

  ## Changes
  - Adds SECURITY DEFINER to generate_proposal_number function
  - This allows the trigger to query proposals table for next number

  ## Notes
  - This is safe because the function only reads data to generate numbers
  - It doesn't bypass any user access controls
*/

CREATE OR REPLACE FUNCTION generate_proposal_number()
RETURNS TRIGGER AS $$
DECLARE
  year_prefix text;
  next_number integer;
  new_proposal_number text;
BEGIN
  -- Only generate if proposal_number is not provided
  IF NEW.proposal_number IS NULL OR NEW.proposal_number = '' THEN
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
$$ LANGUAGE plpgsql SECURITY DEFINER;
