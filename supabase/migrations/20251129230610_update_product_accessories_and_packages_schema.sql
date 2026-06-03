/*
  # Update Product Accessories and Packages Schema

  1. Updates to product_accessories
    - Rename product_id to parent_product_id
    - Add is_default_selected field
    - Add sort_order field
    - Remove quantity and is_required (not needed for accessories)

  2. Updates to product_packages
    - Add labor_hours and labor_phase_id fields

  3. All tables already have proper RLS policies
*/

-- Update product_accessories table
DO $$ 
BEGIN
  -- Rename product_id to parent_product_id if needed
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_accessories' AND column_name = 'product_id'
  ) THEN
    ALTER TABLE product_accessories RENAME COLUMN product_id TO parent_product_id;
  END IF;

  -- Add is_default_selected if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_accessories' AND column_name = 'is_default_selected'
  ) THEN
    ALTER TABLE product_accessories ADD COLUMN is_default_selected boolean DEFAULT false;
  END IF;

  -- Add sort_order if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_accessories' AND column_name = 'sort_order'
  ) THEN
    ALTER TABLE product_accessories ADD COLUMN sort_order int DEFAULT 0;
  END IF;

  -- Add updated_at if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_accessories' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE product_accessories ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;

  -- Drop columns we don't need
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_accessories' AND column_name = 'quantity'
  ) THEN
    ALTER TABLE product_accessories DROP COLUMN quantity;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_accessories' AND column_name = 'is_required'
  ) THEN
    ALTER TABLE product_accessories DROP COLUMN is_required;
  END IF;
END $$;

-- Update product_packages table
DO $$ 
BEGIN
  -- Add labor_hours if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_packages' AND column_name = 'labor_hours'
  ) THEN
    ALTER TABLE product_packages ADD COLUMN labor_hours numeric(10,2) DEFAULT 0;
  END IF;

  -- Add labor_phase_id if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_packages' AND column_name = 'labor_phase_id'
  ) THEN
    ALTER TABLE product_packages ADD COLUMN labor_phase_id uuid REFERENCES labor_phases(id);
  END IF;

  -- Add package_cost if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_packages' AND column_name = 'package_cost'
  ) THEN
    ALTER TABLE product_packages ADD COLUMN package_cost numeric(10,2);
  END IF;

  -- Add category_id if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_packages' AND column_name = 'category_id'
  ) THEN
    ALTER TABLE product_packages ADD COLUMN category_id uuid REFERENCES product_categories(id);
  END IF;
END $$;

-- Add unique constraint to prevent duplicate accessories
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'product_accessories_unique'
  ) THEN
    ALTER TABLE product_accessories 
    ADD CONSTRAINT product_accessories_unique UNIQUE(parent_product_id, accessory_product_id);
  END IF;
END $$;

-- Add check constraint to prevent self-reference
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'product_accessories_no_self_reference'
  ) THEN
    ALTER TABLE product_accessories 
    ADD CONSTRAINT product_accessories_no_self_reference 
    CHECK (parent_product_id != accessory_product_id);
  END IF;
END $$;