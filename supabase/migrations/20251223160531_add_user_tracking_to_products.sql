/*
  # Add User Tracking to Products

  1. New Columns
    - `created_by` (uuid) - User who created the product
    - `updated_by` (uuid) - User who last updated the product

  2. Triggers
    - Automatically set created_by and updated_by on insert/update
    - Join with profiles table to get user names for display

  3. Security
    - No RLS changes needed - inherits from products table
*/

-- Add created_by and updated_by columns to products
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'created_by'
  ) THEN
    ALTER TABLE products ADD COLUMN created_by uuid REFERENCES auth.users(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'updated_by'
  ) THEN
    ALTER TABLE products ADD COLUMN updated_by uuid REFERENCES auth.users(id);
  END IF;
END $$;

-- Create trigger function to set created_by and updated_by
CREATE OR REPLACE FUNCTION set_product_user_tracking()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
    NEW.updated_by := auth.uid();
    NEW.created_at := COALESCE(NEW.created_at, now());
    NEW.updated_at := now();
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.updated_by := auth.uid();
    NEW.updated_at := now();
    -- Preserve original created_by and created_at
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on products table
DROP TRIGGER IF EXISTS trigger_set_product_user_tracking ON products;
CREATE TRIGGER trigger_set_product_user_tracking
  BEFORE INSERT OR UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION set_product_user_tracking();

-- Update existing products to set created_by and updated_by if NULL
UPDATE products 
SET 
  created_by = COALESCE(created_by, (SELECT id FROM auth.users LIMIT 1)),
  updated_by = COALESCE(updated_by, (SELECT id FROM auth.users LIMIT 1))
WHERE created_by IS NULL OR updated_by IS NULL;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_products_created_by ON products(created_by);
CREATE INDEX IF NOT EXISTS idx_products_updated_by ON products(updated_by);
