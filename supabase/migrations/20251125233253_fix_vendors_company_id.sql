/*
  # Fix Vendors Table for Single-Tenant System

  1. Changes
    - Make company_id in vendors table nullable
    - Add trigger to automatically set company_id to the single company
    - Update existing records if any

  2. Notes
    - This is a single-tenant system, so we use the first/only company_id
    - This allows vendors to be created without explicitly passing company_id
*/

-- Make company_id nullable
ALTER TABLE vendors ALTER COLUMN company_id DROP NOT NULL;

-- Update any existing NULL company_ids
UPDATE vendors 
SET company_id = (SELECT id FROM company_settings LIMIT 1)
WHERE company_id IS NULL;

-- Create a trigger to auto-populate company_id if not provided
CREATE OR REPLACE FUNCTION set_vendor_company_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    SELECT id INTO NEW.company_id FROM company_settings LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS auto_set_vendor_company_id ON vendors;
CREATE TRIGGER auto_set_vendor_company_id
  BEFORE INSERT ON vendors
  FOR EACH ROW
  EXECUTE FUNCTION set_vendor_company_id();
