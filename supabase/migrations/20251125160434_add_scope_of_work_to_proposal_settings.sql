/*
  # Add Scope of Work to Proposal Settings

  1. Changes
    - Add `scope_of_work` text field to proposal_settings table
    - This will hold the detailed written project description
  
  2. Purpose
    - Allows users to write/paste detailed project scope
    - Will appear as separate page in customer proposal reports
    - Supports long-form narrative descriptions
*/

-- Add scope_of_work column
ALTER TABLE proposal_settings
ADD COLUMN IF NOT EXISTS scope_of_work text;

-- Add comment for documentation
COMMENT ON COLUMN proposal_settings.scope_of_work IS 'Detailed written description of project scope that appears as separate page in proposal';
