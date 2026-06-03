/*
  # Fix products company_id foreign key constraint

  1. Changes
    - Drop the incorrect foreign key constraint that points to auth.users
    - Update existing products to use the correct company_id from company_settings
    - Add the correct foreign key constraint that points to company_settings
    - This allows products to be associated with companies properly

  2. Security
    - RLS policies remain unchanged
    - Foreign key ensures data integrity with company_settings table
*/

-- Drop the incorrect constraint first
ALTER TABLE products 
DROP CONSTRAINT IF EXISTS products_company_id_fkey;

-- Now update all products to use the default company_id
UPDATE products 
SET company_id = get_default_company_id();

-- Add the correct constraint pointing to company_settings
ALTER TABLE products 
ADD CONSTRAINT products_company_id_fkey 
FOREIGN KEY (company_id) 
REFERENCES company_settings(id) 
ON DELETE CASCADE;