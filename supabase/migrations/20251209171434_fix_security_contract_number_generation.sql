/*
  # Fix Security Contract Number Generation

  1. Changes
    - Replace the generate_security_contract_number() function to avoid using FOR UPDATE with aggregate functions
    - Use advisory locks instead to prevent race conditions
    - Maintains sequential numbering per year (SC-YYYY-00001)

  2. Security
    - Advisory lock ensures only one contract number is generated at a time
    - Prevents duplicate contract numbers
*/

-- Drop and recreate the function with proper locking mechanism
CREATE OR REPLACE FUNCTION generate_security_contract_number()
RETURNS TRIGGER AS $$
DECLARE
  year_part text;
  next_num integer;
  new_contract_number text;
  lock_key bigint;
BEGIN
  -- Only generate if contract_number is not already set
  IF NEW.contract_number IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Get current year
  year_part := TO_CHAR(NOW(), 'YYYY');

  -- Create a unique lock key based on the year (hash of 'security_contract_' + year)
  lock_key := hashtext('security_contract_' || year_part);

  -- Acquire advisory lock to prevent concurrent number generation
  PERFORM pg_advisory_xact_lock(lock_key);

  -- Get the next number for this year (without FOR UPDATE since we have advisory lock)
  SELECT COALESCE(MAX(
    CAST(
      SUBSTRING(contract_number FROM 'SC-' || year_part || '-(\\d+)')
      AS INTEGER
    )
  ), 0) + 1
  INTO next_num
  FROM security_contracts
  WHERE contract_number ~ ('^SC-' || year_part || '-\\d+$');

  -- Generate the new contract number
  new_contract_number := 'SC-' || year_part || '-' || LPAD(next_num::text, 5, '0');

  -- Set the contract number
  NEW.contract_number := new_contract_number;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Ensure the trigger exists (create if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trigger_generate_security_contract_number'
    AND tgrelid = 'security_contracts'::regclass
  ) THEN
    CREATE TRIGGER trigger_generate_security_contract_number
      BEFORE INSERT ON security_contracts
      FOR EACH ROW
      EXECUTE FUNCTION generate_security_contract_number();
  END IF;
END $$;