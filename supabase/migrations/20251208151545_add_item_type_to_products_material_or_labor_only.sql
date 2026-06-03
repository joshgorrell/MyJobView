/*
  # Add item_type to products table

  1. Changes
    - Add item_type column to products table
    - Only allow 'material' or 'labor' (no 'both' option)
    - Default to 'material'
    - Required field (NOT NULL)
  
  2. Notes
    - For packages and accessories, tax will be calculated by examining each component item
    - Each component's item_type (material/labor) determines its taxability
    - This provides granular and accurate tax calculations based on tax_environment and tax_project_type
*/

-- Add item_type column to products
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS item_type text NOT NULL DEFAULT 'material';

-- Add check constraint to only allow 'material' or 'labor'
ALTER TABLE products 
ADD CONSTRAINT products_item_type_check 
CHECK (item_type IN ('material', 'labor'));

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_products_item_type ON products(item_type);
