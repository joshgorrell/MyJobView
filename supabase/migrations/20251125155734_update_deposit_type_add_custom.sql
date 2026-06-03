/*
  # Update Deposit Type to Include Custom Option

  1. Changes
    - Update deposit_type constraint to include 'custom' option
    - Allows users to specify any fixed deposit amount
  
  2. Notes
    - 'percentage' = deposit based on percentage of total
    - 'parts_total' = deposit equals all materials/parts
    - 'custom' = any fixed dollar amount
    - 'none' = no deposit required (PO only)
*/

-- Drop the old constraint
ALTER TABLE proposal_settings
DROP CONSTRAINT IF EXISTS proposal_settings_deposit_type_check;

-- Add the new constraint with 'custom' option
ALTER TABLE proposal_settings
ADD CONSTRAINT proposal_settings_deposit_type_check
CHECK (deposit_type IN ('percentage', 'parts_total', 'custom', 'none'));
