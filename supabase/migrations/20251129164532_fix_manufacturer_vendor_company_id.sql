/*
  # Fix Manufacturer and Vendor Company ID

  1. Changes
    - Add default company_id to manufacturers and vendors tables
    - This allows them to be created without explicitly providing company_id
    - Since this is a single-tenant system, using the first company is safe

  2. Security
    - No changes to RLS policies
*/

-- Set default value for manufacturers company_id
ALTER TABLE manufacturers
ALTER COLUMN company_id SET DEFAULT get_default_company_id();

-- Set default value for vendors company_id
ALTER TABLE vendors
ALTER COLUMN company_id SET DEFAULT get_default_company_id();
