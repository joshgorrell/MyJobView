/*
  # Add email override to security contracts

  1. Changes to security_contracts table
    - Add `email_override` (text, optional) - Override email for contract communications
    
  2. Purpose
    - Allows contract-specific email addresses without changing the contact's primary email
    - Useful when contract communications should go to a different email than the contact's default
*/

-- Add email override column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'security_contracts' AND column_name = 'email_override'
  ) THEN
    ALTER TABLE security_contracts ADD COLUMN email_override text;
  END IF;
END $$;
