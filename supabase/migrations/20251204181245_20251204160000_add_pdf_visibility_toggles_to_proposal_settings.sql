/*
  # Add PDF Visibility Toggles to Proposal Settings

  1. Changes to proposal_settings
    - `show_scope_in_pdf` (boolean, default true) - Control visibility of AI-generated Scope of Work
    - `show_contract_in_pdf` (boolean, default true) - Control visibility of Contract
    - `show_deposit_in_pdf` (boolean, default true) - Control visibility of Deposit details

  2. Purpose
    - Allow users to customize which sections appear in the PDF proposal report
    - These can be separate pages from the main proposal for better layout
*/

-- Add show_scope_in_pdf column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposal_settings' AND column_name = 'show_scope_in_pdf'
  ) THEN
    ALTER TABLE proposal_settings ADD COLUMN show_scope_in_pdf boolean DEFAULT true;
  END IF;
END $$;

-- Add show_contract_in_pdf column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposal_settings' AND column_name = 'show_contract_in_pdf'
  ) THEN
    ALTER TABLE proposal_settings ADD COLUMN show_contract_in_pdf boolean DEFAULT true;
  END IF;
END $$;

-- Add show_deposit_in_pdf column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposal_settings' AND column_name = 'show_deposit_in_pdf'
  ) THEN
    ALTER TABLE proposal_settings ADD COLUMN show_deposit_in_pdf boolean DEFAULT true;
  END IF;
END $$;