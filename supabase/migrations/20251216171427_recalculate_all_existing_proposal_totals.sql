/*
  # Recalculate All Existing Proposal Totals

  1. Purpose
    - Apply the updated calculate_proposal_totals logic to all existing proposals
    - Fixes the parts vs labor split for proposals created before the fix
    
  2. Changes
    - Runs calculate_proposal_totals on every proposal in the system
    - Ensures all proposals now have consistent totals matching the tax report
*/

-- Recalculate totals for all existing proposals
DO $$
DECLARE
  v_proposal_id uuid;
BEGIN
  FOR v_proposal_id IN 
    SELECT id FROM proposals 
    ORDER BY created_at
  LOOP
    PERFORM calculate_proposal_totals(v_proposal_id);
  END LOOP;
  
  RAISE NOTICE 'Recalculated totals for all proposals';
END $$;
