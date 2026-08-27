/*
  # Add Item Type to Products
*/
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'item_type'
  ) THEN
    ALTER TABLE products ADD COLUMN item_type text DEFAULT 'material';
    ALTER TABLE products ADD CONSTRAINT products_item_type_check 
      CHECK (item_type IN ('labor', 'material', 'both'));
    ALTER TABLE products ALTER COLUMN item_type SET NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_products_item_type ON products(item_type);
COMMENT ON COLUMN products.item_type IS 'Type of product for tax calculation purposes: labor, material, or both';