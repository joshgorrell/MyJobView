/*
  # Add default company_id to products table

  1. Changes
    - Add default value for company_id column that gets the first company
    - This allows products to be created without explicitly providing company_id
    - Since this is a single-tenant system, using the first company is safe

  2. Security
    - No changes to RLS policies
*/

-- Add default function to get first company_id
CREATE OR REPLACE FUNCTION get_default_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT id FROM company_settings LIMIT 1;
$$;

-- Set default value for company_id
ALTER TABLE products 
ALTER COLUMN company_id SET DEFAULT get_default_company_id();