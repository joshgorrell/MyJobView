/*
  # Add Auto-Generated Proposal Numbers

  ## Summary
  Creates a trigger to automatically generate sequential proposal numbers when new proposals are created.

  ## Changes
  1. **Function**: `generate_proposal_number()`
     - Generates proposal numbers in format: PROP-YYYY-NNNN
     - Example: PROP-2025-0001
     - Sequential within each year

  2. **Trigger**: `trigger_generate_proposal_number`
     - Fires BEFORE INSERT on proposals table
     - Only generates number if not already provided

  ## Notes
  - Proposal numbers are unique and sequential
  - Format: PROP-{YEAR}-{4-digit sequence number}
  - Sequence resets each year
*/

-- Function to generate proposal number
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
          SUBSTRING(proposal_number FROM 'PROP-' || year_prefix || '-(\d+)') 
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
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_generate_proposal_number ON proposals;
CREATE TRIGGER trigger_generate_proposal_number
  BEFORE INSERT ON proposals
  FOR EACH ROW
  EXECUTE FUNCTION generate_proposal_number();
