/*
  # Add Item Type to Products

  1. Changes
    - Add `item_type` column to `products` table
      - Type: text with constraint ('labor', 'material', 'both')
      - Required: NOT NULL with default 'material'
      - This is required for proper sales tax calculations

  2. Rationale
    - Different tax rules apply to labor vs materials
    - Tax calculations need to differentiate between parts and labor
    - Required field ensures all products have proper tax classification
  
  3. Security
    - No RLS changes needed (products table already has proper policies)
*/

-- Add item_type column to products
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'item_type'
  ) THEN
    -- Add column with default value first
    ALTER TABLE products 
    ADD COLUMN item_type text DEFAULT 'material';
    
    -- Add constraint
    ALTER TABLE products
    ADD CONSTRAINT products_item_type_check 
    CHECK (item_type IN ('labor', 'material', 'both'));
    
    -- Now make it NOT NULL (since all rows have the default value)
    ALTER TABLE products
    ALTER COLUMN item_type SET NOT NULL;
  END IF;
END $$;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_products_item_type 
ON products(item_type);

-- Add helpful comment
COMMENT ON COLUMN products.item_type IS 'Type of product for tax calculation purposes: labor, material, or both';
