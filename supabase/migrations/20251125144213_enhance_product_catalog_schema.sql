/*
  # Enhance Product Catalog Schema

  1. Add company_id to existing vendors and labor_phases tables
  2. Create manufacturers table
  3. Add comprehensive product fields
  4. Create accessory and package tables
*/

-- Add company_id to vendors if missing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vendors' AND column_name = 'company_id') THEN
    ALTER TABLE vendors ADD COLUMN company_id uuid;
    -- Set company_id for existing vendors (use first product's company_id if available)
    UPDATE vendors SET company_id = (SELECT company_id FROM products LIMIT 1) WHERE company_id IS NULL;
    ALTER TABLE vendors ALTER COLUMN company_id SET NOT NULL;
  END IF;
END $$;

-- Add company_id to labor_phases if missing  
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'labor_phases' AND column_name = 'company_id') THEN
    ALTER TABLE labor_phases ADD COLUMN company_id uuid;
    UPDATE labor_phases SET company_id = (SELECT company_id FROM products LIMIT 1) WHERE company_id IS NULL;
    ALTER TABLE labor_phases ALTER COLUMN company_id SET NOT NULL;
  END IF;
END $$;

-- Create manufacturers table
CREATE TABLE IF NOT EXISTS manufacturers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  name text NOT NULL,
  website text,
  contact_name text,
  contact_email text,
  contact_phone text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE manufacturers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can manage manufacturers" ON manufacturers;
CREATE POLICY "Authenticated users can manage manufacturers"
  ON manufacturers FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Add new columns to products table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'manufacturer_id') THEN
    ALTER TABLE products ADD COLUMN manufacturer_id uuid REFERENCES manufacturers(id) ON DELETE SET NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'manufacturer_model_number') THEN
    ALTER TABLE products ADD COLUMN manufacturer_model_number text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'item_name') THEN
    ALTER TABLE products ADD COLUMN item_name text;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'item_color') THEN
    ALTER TABLE products ADD COLUMN item_color text;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'default_qty') THEN
    ALTER TABLE products ADD COLUMN default_qty numeric(10,2) DEFAULT 1;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'margin_percent') THEN
    ALTER TABLE products ADD COLUMN margin_percent numeric(10,2);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'our_price') THEN
    ALTER TABLE products ADD COLUMN our_price numeric(10,2);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'minimum_price') THEN
    ALTER TABLE products ADD COLUMN minimum_price numeric(10,2);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'minimum_margin') THEN
    ALTER TABLE products ADD COLUMN minimum_margin numeric(10,2);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'inventory_type') THEN
    ALTER TABLE products ADD COLUMN inventory_type text DEFAULT 'inventory';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'is_taxable') THEN
    ALTER TABLE products ADD COLUMN is_taxable boolean DEFAULT true;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'default_vendor_id') THEN
    ALTER TABLE products ADD COLUMN default_vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'labor_phase_id') THEN
    ALTER TABLE products ADD COLUMN labor_phase_id uuid REFERENCES labor_phases(id) ON DELETE SET NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'default_labor_hours') THEN
    ALTER TABLE products ADD COLUMN default_labor_hours numeric(10,2);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'sales_description') THEN
    ALTER TABLE products ADD COLUMN sales_description text;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'purchase_description') THEN
    ALTER TABLE products ADD COLUMN purchase_description text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'default_install_task') THEN
    ALTER TABLE products ADD COLUMN default_install_task text;
  END IF;
END $$;

-- Create product accessories table
CREATE TABLE IF NOT EXISTS product_accessories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES products(id) ON DELETE CASCADE NOT NULL,
  accessory_product_id uuid REFERENCES products(id) ON DELETE CASCADE NOT NULL,
  quantity numeric(10,2) DEFAULT 1,
  is_required boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE product_accessories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can manage product accessories" ON product_accessories;
CREATE POLICY "Authenticated users can manage product accessories"
  ON product_accessories FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create product packages table
CREATE TABLE IF NOT EXISTS product_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  package_name text NOT NULL,
  package_sku text,
  description text,
  sales_description text,
  package_price numeric(10,2),
  is_price_override boolean DEFAULT false,
  show_components boolean DEFAULT true,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE product_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can manage packages" ON product_packages;
CREATE POLICY "Authenticated users can manage packages"
  ON product_packages FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create product package items table
CREATE TABLE IF NOT EXISTS product_package_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid REFERENCES product_packages(id) ON DELETE CASCADE NOT NULL,
  product_id uuid REFERENCES products(id) ON DELETE CASCADE NOT NULL,
  quantity numeric(10,2) DEFAULT 1,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE product_package_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can manage package items" ON product_package_items;
CREATE POLICY "Authenticated users can manage package items"
  ON product_package_items FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_manufacturers_company_id ON manufacturers(company_id);
CREATE INDEX IF NOT EXISTS idx_vendors_company_id ON vendors(company_id);
CREATE INDEX IF NOT EXISTS idx_labor_phases_company_id ON labor_phases(company_id);
CREATE INDEX IF NOT EXISTS idx_products_manufacturer_id ON products(manufacturer_id);
CREATE INDEX IF NOT EXISTS idx_products_vendor_id ON products(default_vendor_id);
CREATE INDEX IF NOT EXISTS idx_products_labor_phase_id ON products(labor_phase_id);
CREATE INDEX IF NOT EXISTS idx_product_accessories_product_id ON product_accessories(product_id);
CREATE INDEX IF NOT EXISTS idx_product_packages_company_id ON product_packages(company_id);
CREATE INDEX IF NOT EXISTS idx_product_package_items_package_id ON product_package_items(package_id);

-- Function to calculate our_price from cost and margin
CREATE OR REPLACE FUNCTION calculate_product_price()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.margin_percent IS NOT NULL AND NEW.cost IS NOT NULL AND NEW.cost > 0 THEN
    NEW.our_price := NEW.cost / (1 - (NEW.margin_percent / 100));
  ELSIF NEW.our_price IS NOT NULL AND NEW.cost IS NOT NULL AND NEW.our_price > 0 THEN
    NEW.margin_percent := ((NEW.our_price - NEW.cost) / NEW.our_price) * 100;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS calculate_product_price_trigger ON products;
CREATE TRIGGER calculate_product_price_trigger
  BEFORE INSERT OR UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION calculate_product_price();

-- Set default descriptions
CREATE OR REPLACE FUNCTION set_default_descriptions()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.sales_description IS NULL AND NEW.description IS NOT NULL THEN
    NEW.sales_description := NEW.description;
  END IF;
  IF NEW.purchase_description IS NULL AND NEW.sales_description IS NOT NULL THEN
    NEW.purchase_description := NEW.sales_description;
  END IF;
  IF NEW.item_name IS NULL AND NEW.name IS NOT NULL THEN
    NEW.item_name := NEW.name;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_default_descriptions_trigger ON products;
CREATE TRIGGER set_default_descriptions_trigger
  BEFORE INSERT OR UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION set_default_descriptions();
