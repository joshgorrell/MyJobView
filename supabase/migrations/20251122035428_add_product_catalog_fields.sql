/*
  # Add Product Catalog and Operations Fields

  1. New Columns Added to `products` table
    
    **Manufacturing/Catalog Info:**
    - `manufacturer` (text) - Brand/manufacturer name
    - `model_number` (text) - Model identifier
    - `mpn` (text) - Manufacturer Part Number
    - `upc` (text) - Universal Product Code
    - `thumbnail_url` (text) - Product image URL
    - `datasheet_url` (text) - Technical documentation URL
    
    **Purchasing:**
    - `min_order_quantity` (numeric) - Minimum order qty from vendor
    - `lead_time_days` (integer) - Expected delivery time
    - `reorder_point` (numeric) - Trigger for reordering
    
    **Sales:**
    - `msrp` (numeric) - Manufacturer Suggested Retail Price
    - `map_price` (numeric) - Minimum Advertised Price
    
    **Installation:**
    - `estimated_install_hours` (numeric) - Expected installation time
    - `requires_programming` (boolean) - Needs configuration/programming

  2. Security
    - No RLS changes needed - inherits from products table
    - All columns are NULLABLE - zero breaking changes

  3. Important Notes
    - ALL new columns are optional
    - Existing data is unaffected
    - Existing queries continue to work unchanged
*/

-- Add manufacturing and catalog fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'manufacturer'
  ) THEN
    ALTER TABLE products ADD COLUMN manufacturer text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'model_number'
  ) THEN
    ALTER TABLE products ADD COLUMN model_number text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'mpn'
  ) THEN
    ALTER TABLE products ADD COLUMN mpn text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'upc'
  ) THEN
    ALTER TABLE products ADD COLUMN upc text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'thumbnail_url'
  ) THEN
    ALTER TABLE products ADD COLUMN thumbnail_url text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'datasheet_url'
  ) THEN
    ALTER TABLE products ADD COLUMN datasheet_url text;
  END IF;
END $$;

-- Add purchasing fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'min_order_quantity'
  ) THEN
    ALTER TABLE products ADD COLUMN min_order_quantity numeric;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'lead_time_days'
  ) THEN
    ALTER TABLE products ADD COLUMN lead_time_days integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'reorder_point'
  ) THEN
    ALTER TABLE products ADD COLUMN reorder_point numeric;
  END IF;
END $$;

-- Add sales fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'msrp'
  ) THEN
    ALTER TABLE products ADD COLUMN msrp numeric;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'map_price'
  ) THEN
    ALTER TABLE products ADD COLUMN map_price numeric;
  END IF;
END $$;

-- Add installation fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'estimated_install_hours'
  ) THEN
    ALTER TABLE products ADD COLUMN estimated_install_hours numeric;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'requires_programming'
  ) THEN
    ALTER TABLE products ADD COLUMN requires_programming boolean DEFAULT false;
  END IF;
END $$;

-- Create indexes for commonly searched fields
CREATE INDEX IF NOT EXISTS idx_products_manufacturer ON products(manufacturer);
CREATE INDEX IF NOT EXISTS idx_products_model_number ON products(model_number);
CREATE INDEX IF NOT EXISTS idx_products_mpn ON products(mpn);
CREATE INDEX IF NOT EXISTS idx_products_upc ON products(upc);
CREATE INDEX IF NOT EXISTS idx_products_reorder_point ON products(reorder_point) WHERE reorder_point IS NOT NULL;
