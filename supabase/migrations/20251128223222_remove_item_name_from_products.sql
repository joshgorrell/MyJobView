/*
  # Remove item_name column from products table

  1. Changes
    - Drop the item_name column from products table
    - The manufacturer_model_number serves as the primary product identifier
    - The name column is kept for legacy compatibility with other systems

  2. Notes
    - No data loss as item_name was already being set to manufacturer_model_number
    - All product displays now use manufacturer_model_number directly
*/

-- Drop the item_name column
ALTER TABLE products 
DROP COLUMN IF EXISTS item_name;