/*
  # Update Balance Payment Terms Default Value

  1. Changes
    - Update balance_payment_terms default value from "Upon project completion" to "Upon project completion or progress"
    - Update existing NULL values to use the new default

  2. Notes
    - This provides more flexibility in the default wording
    - Existing non-NULL custom values are preserved
*/

-- Update the default value for new records
ALTER TABLE proposal_settings
  ALTER COLUMN balance_payment_terms SET DEFAULT 'Upon project completion or progress';

-- Update existing NULL values to use the new default
UPDATE proposal_settings
SET balance_payment_terms = 'Upon project completion or progress'
WHERE balance_payment_terms IS NULL OR balance_payment_terms = 'Upon project completion';

-- Add comment for clarity
COMMENT ON COLUMN proposal_settings.balance_payment_terms IS
  'Custom text describing when the final balance is due after deposit. Default: "Upon project completion or progress"';
