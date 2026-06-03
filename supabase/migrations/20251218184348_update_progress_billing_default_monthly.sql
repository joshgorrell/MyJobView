/*
  # Update Progress Billing Default to Monthly

  1. Changes
    - Update default value for progress_billing_type to 'monthly'
    - Progress billing is always monthly (or earlier if project completes sooner)

  2. Notes
    - This simplifies the billing model
    - Progress invoices are sent monthly as work progresses
    - Can bill earlier if project finishes before next billing cycle
*/

-- Update the default to 'monthly' since that's now the standard approach
ALTER TABLE proposal_settings 
  ALTER COLUMN progress_billing_type SET DEFAULT 'monthly';

-- Update existing records that might have 'completion' or 'none' to 'monthly'
UPDATE proposal_settings 
SET progress_billing_type = 'monthly' 
WHERE progress_billing_type IS NULL 
   OR progress_billing_type IN ('completion', 'none');
