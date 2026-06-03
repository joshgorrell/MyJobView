/*
  # Fix Manufacturers Table for Single-Tenant System

  1. Changes
    - Make company_id in manufacturers table nullable
    - Add trigger to automatically set company_id to the single company
    - Update existing records if any

  2. Notes
    - This is a single-tenant system, so we use the first/only company_id
    - This allows manufacturers to be created without explicitly passing company_id
*/

-- Make company_id nullable
ALTER TABLE manufacturers ALTER COLUMN company_id DROP NOT NULL;

-- Update any existing NULL company_ids
UPDATE manufacturers 
SET company_id = (SELECT id FROM company_settings LIMIT 1)
WHERE company_id IS NULL;

-- Create a trigger to auto-populate company_id if not provided
CREATE OR REPLACE FUNCTION set_manufacturer_company_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    SELECT id INTO NEW.company_id FROM company_settings LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS auto_set_manufacturer_company_id ON manufacturers;
CREATE TRIGGER auto_set_manufacturer_company_id
  BEFORE INSERT ON manufacturers
  FOR EACH ROW
  EXECUTE FUNCTION set_manufacturer_company_id();
