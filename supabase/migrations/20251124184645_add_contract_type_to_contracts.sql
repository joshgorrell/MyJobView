/*
  # Add contract type to contracts table
  
  1. Changes
    - Add `contract_type` column to contracts table (security, sales)
    - Add `description` column for additional context
    - Migrate existing security_contract_templates to contracts table
    - Remove contract_templates module from Finance department
  
  2. Security
    - Maintains existing RLS policies
*/

-- Add contract_type and description to contracts table
ALTER TABLE contracts 
ADD COLUMN IF NOT EXISTS contract_type text CHECK (contract_type IN ('security', 'sales')),
ADD COLUMN IF NOT EXISTS description text;

-- Migrate existing security contract templates to unified contracts table
DO $$
DECLARE
  user_id uuid;
BEGIN
  -- Get a valid user ID from auth.users
  SELECT id INTO user_id FROM auth.users LIMIT 1;
  
  -- Only migrate if we have a valid user
  IF user_id IS NOT NULL THEN
    INSERT INTO contracts (company_id, name, content, description, contract_type, is_default, created_at)
    SELECT 
      user_id,
      name,
      contract_terms,
      description,
      'security' as contract_type,
      false as is_default,
      created_at
    FROM security_contract_templates
    WHERE NOT EXISTS (
      SELECT 1 FROM contracts WHERE name = security_contract_templates.name
    );
  END IF;
END $$;

-- Remove Contract Templates module from Finance department
DELETE FROM department_modules 
WHERE module_key = 'contract_templates' 
AND department_id = (SELECT id FROM departments WHERE name = 'finance');
