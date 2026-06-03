/*
  # Fix Security Contract Number Generation Regex
  
  1. Changes
    - Fix regex pattern to use [0-9] instead of \d for PostgreSQL compatibility
    - This ensures the pattern matches existing contract numbers correctly
  
  2. Issue
    - The regex pattern '^SC-' || year_part || '-\\d+$' was not matching
    - PostgreSQL regex requires [0-9] instead of \d
*/

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

  -- Get the next number for this year (use [0-9] instead of \d for regex)
  SELECT COALESCE(MAX(
    CAST(
      SUBSTRING(contract_number FROM 'SC-' || year_part || '-([0-9]+)')
      AS INTEGER
    )
  ), 0) + 1
  INTO next_num
  FROM security_contracts
  WHERE contract_number ~ ('^SC-' || year_part || '-[0-9]+$');

  -- Generate the new contract number
  new_contract_number := 'SC-' || year_part || '-' || LPAD(next_num::text, 5, '0');

  -- Set the contract number
  NEW.contract_number := new_contract_number;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
