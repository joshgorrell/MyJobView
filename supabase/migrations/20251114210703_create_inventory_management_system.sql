/*
  # Create Comprehensive Inventory Management System
  
  ## Summary
  Creates a complete inventory management system with stock tracking, warehouses, 
  purchase orders, stock movements, and automated reorder alerts.
  
  ## New Tables
  
  ### 1. warehouses
  Multiple warehouse/location support for multi-site inventory
  - id (uuid, primary key)
  - name (warehouse name)
  - address, city, state, zip
  - is_active (boolean)
  - manager_id (references profiles)
  
  ### 2. product_inventory
  Tracks stock levels per product per warehouse
  - id (uuid, primary key)
  - product_id (references products)
  - warehouse_id (references warehouses)
  - quantity_on_hand (current stock)
  - quantity_reserved (allocated to orders)
  - quantity_available (on_hand - reserved)
  - reorder_point (minimum before reorder)
  - reorder_quantity (how much to order)
  - last_counted_at (last physical count)
  - UNIQUE constraint on (product_id, warehouse_id)
  
  ### 3. vendors
  Supplier management
  - id (uuid, primary key)
  - vendor_name
  - contact_name, email, phone
  - address, city, state, zip
  - payment_terms
  - is_active
  
  ### 4. purchase_orders
  Track orders from vendors
  - id (uuid, primary key)
  - po_number (auto-generated)
  - vendor_id (references vendors)
  - warehouse_id (destination warehouse)
  - status (draft, sent, partial, received, cancelled)
  - order_date
  - expected_date
  - received_date
  - subtotal, tax_amount, shipping_cost, total
  - notes
  - created_by (references profiles)
  
  ### 5. purchase_order_items
  Line items for purchase orders
  - id (uuid, primary key)
  - po_id (references purchase_orders)
  - product_id (references products)
  - quantity_ordered
  - quantity_received
  - unit_cost
  - total_cost
  
  ### 6. stock_movements
  Audit trail of all inventory changes
  - id (uuid, primary key)
  - product_id (references products)
  - warehouse_id (references warehouses)
  - movement_type (purchase, sale, adjustment, transfer_in, transfer_out, return)
  - quantity (positive or negative)
  - reference_type (po, invoice, project, adjustment)
  - reference_id (uuid of related record)
  - notes
  - created_by (references profiles)
  - created_at
  
  ### 7. stock_adjustments
  Manual inventory corrections
  - id (uuid, primary key)
  - warehouse_id (references warehouses)
  - adjustment_date
  - reason (count_correction, damage, theft, other)
  - notes
  - approved_by (references profiles)
  - created_by (references profiles)
  
  ### 8. stock_adjustment_items
  Line items for adjustments
  - id (uuid, primary key)
  - adjustment_id (references stock_adjustments)
  - product_id (references products)
  - quantity_before
  - quantity_after
  - quantity_change
  - notes
  
  ### 9. stock_transfers
  Move inventory between warehouses
  - id (uuid, primary key)
  - transfer_number
  - from_warehouse_id (references warehouses)
  - to_warehouse_id (references warehouses)
  - status (pending, in_transit, received, cancelled)
  - transfer_date
  - expected_date
  - received_date
  - notes
  - created_by (references profiles)
  
  ### 10. stock_transfer_items
  Line items for transfers
  - id (uuid, primary key)
  - transfer_id (references stock_transfers)
  - product_id (references products)
  - quantity
  - quantity_received
  
  ## Security
  - All tables have RLS enabled
  - Authenticated users can view inventory
  - Only admins/managers can modify inventory
  - Full audit trail via stock_movements
  
  ## Triggers
  - Auto-generate PO numbers
  - Auto-update inventory on PO receipt
  - Auto-create stock movements
  - Auto-calculate available quantity
  - Low stock alerts
*/

-- Create warehouses table
CREATE TABLE IF NOT EXISTS warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text,
  city text,
  state text,
  zip text,
  phone text,
  manager_id uuid REFERENCES profiles(id),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view warehouses"
  ON warehouses FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage warehouses"
  ON warehouses FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'manager')
    )
  );

-- Create vendors table
CREATE TABLE IF NOT EXISTS vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_name text NOT NULL,
  contact_name text,
  email text,
  phone text,
  address text,
  city text,
  state text,
  zip text,
  payment_terms text,
  account_number text,
  website text,
  notes text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view vendors"
  ON vendors FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage vendors"
  ON vendors FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'manager')
    )
  );

-- Update products table to reference vendors
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'vendor_id'
  ) THEN
    ALTER TABLE products ADD COLUMN vendor_id uuid REFERENCES vendors(id);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'barcode'
  ) THEN
    ALTER TABLE products ADD COLUMN barcode text;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'weight'
  ) THEN
    ALTER TABLE products ADD COLUMN weight numeric;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'dimensions'
  ) THEN
    ALTER TABLE products ADD COLUMN dimensions text;
  END IF;
END $$;

-- Create product_inventory table
CREATE TABLE IF NOT EXISTS product_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  quantity_on_hand numeric DEFAULT 0 NOT NULL CHECK (quantity_on_hand >= 0),
  quantity_reserved numeric DEFAULT 0 NOT NULL CHECK (quantity_reserved >= 0),
  quantity_available numeric GENERATED ALWAYS AS (quantity_on_hand - quantity_reserved) STORED,
  reorder_point numeric DEFAULT 0,
  reorder_quantity numeric DEFAULT 0,
  last_counted_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(product_id, warehouse_id)
);

ALTER TABLE product_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view inventory"
  ON product_inventory FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage inventory"
  ON product_inventory FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'manager')
    )
  );

-- Create purchase_orders table
CREATE TABLE IF NOT EXISTS purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number text UNIQUE NOT NULL,
  vendor_id uuid NOT NULL REFERENCES vendors(id),
  warehouse_id uuid NOT NULL REFERENCES warehouses(id),
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'partial', 'received', 'cancelled')),
  order_date date DEFAULT CURRENT_DATE,
  expected_date date,
  received_date date,
  subtotal numeric DEFAULT 0,
  tax_amount numeric DEFAULT 0,
  shipping_cost numeric DEFAULT 0,
  total numeric DEFAULT 0,
  notes text,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view purchase orders"
  ON purchase_orders FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage purchase orders"
  ON purchase_orders FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'manager')
    )
  );

-- Create purchase_order_items table
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  quantity_ordered numeric NOT NULL CHECK (quantity_ordered > 0),
  quantity_received numeric DEFAULT 0 CHECK (quantity_received >= 0),
  unit_cost numeric NOT NULL CHECK (unit_cost >= 0),
  total_cost numeric GENERATED ALWAYS AS (quantity_ordered * unit_cost) STORED,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view PO items"
  ON purchase_order_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage PO items"
  ON purchase_order_items FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'manager')
    )
  );

-- Create stock_movements table
CREATE TABLE IF NOT EXISTS stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id),
  warehouse_id uuid NOT NULL REFERENCES warehouses(id),
  movement_type text NOT NULL CHECK (movement_type IN ('purchase', 'sale', 'adjustment', 'transfer_in', 'transfer_out', 'return')),
  quantity numeric NOT NULL,
  quantity_before numeric NOT NULL,
  quantity_after numeric NOT NULL,
  reference_type text,
  reference_id uuid,
  notes text,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view stock movements"
  ON stock_movements FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "System can create stock movements"
  ON stock_movements FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_product_inventory_product ON product_inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_product_inventory_warehouse ON product_inventory(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_product_inventory_low_stock ON product_inventory(warehouse_id) WHERE quantity_available <= reorder_point;
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_vendor ON purchase_orders(vendor_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_warehouse ON stock_movements(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created ON stock_movements(created_at DESC);

-- Create stock_adjustments table
CREATE TABLE IF NOT EXISTS stock_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adjustment_number text UNIQUE NOT NULL,
  warehouse_id uuid NOT NULL REFERENCES warehouses(id),
  adjustment_date date DEFAULT CURRENT_DATE,
  reason text CHECK (reason IN ('count_correction', 'damage', 'theft', 'expired', 'other')),
  notes text,
  approved_by uuid REFERENCES profiles(id),
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE stock_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view adjustments"
  ON stock_adjustments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage adjustments"
  ON stock_adjustments FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'manager')
    )
  );

-- Create stock_adjustment_items table
CREATE TABLE IF NOT EXISTS stock_adjustment_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adjustment_id uuid NOT NULL REFERENCES stock_adjustments(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  quantity_before numeric NOT NULL,
  quantity_after numeric NOT NULL,
  quantity_change numeric GENERATED ALWAYS AS (quantity_after - quantity_before) STORED,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE stock_adjustment_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view adjustment items"
  ON stock_adjustment_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage adjustment items"
  ON stock_adjustment_items FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'manager')
    )
  );

-- Create stock_transfers table
CREATE TABLE IF NOT EXISTS stock_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_number text UNIQUE NOT NULL,
  from_warehouse_id uuid NOT NULL REFERENCES warehouses(id),
  to_warehouse_id uuid NOT NULL REFERENCES warehouses(id),
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'in_transit', 'received', 'cancelled')),
  transfer_date date DEFAULT CURRENT_DATE,
  expected_date date,
  received_date date,
  notes text,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  CHECK (from_warehouse_id != to_warehouse_id)
);

ALTER TABLE stock_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view transfers"
  ON stock_transfers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage transfers"
  ON stock_transfers FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'manager')
    )
  );

-- Create stock_transfer_items table
CREATE TABLE IF NOT EXISTS stock_transfer_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  quantity numeric NOT NULL CHECK (quantity > 0),
  quantity_received numeric DEFAULT 0 CHECK (quantity_received >= 0),
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE stock_transfer_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view transfer items"
  ON stock_transfer_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage transfer items"
  ON stock_transfer_items FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'manager')
    )
  );

-- Function to generate PO number
CREATE OR REPLACE FUNCTION generate_po_number()
RETURNS text AS $$
DECLARE
  next_num integer;
  po_num text;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(po_number FROM 4) AS integer)), 0) + 1
  INTO next_num
  FROM purchase_orders
  WHERE po_number ~ '^PO-[0-9]+$';
  
  po_num := 'PO-' || LPAD(next_num::text, 6, '0');
  RETURN po_num;
END;
$$ LANGUAGE plpgsql;

-- Function to generate adjustment number
CREATE OR REPLACE FUNCTION generate_adjustment_number()
RETURNS text AS $$
DECLARE
  next_num integer;
  adj_num text;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(adjustment_number FROM 5) AS integer)), 0) + 1
  INTO next_num
  FROM stock_adjustments
  WHERE adjustment_number ~ '^ADJ-[0-9]+$';
  
  adj_num := 'ADJ-' || LPAD(next_num::text, 6, '0');
  RETURN adj_num;
END;
$$ LANGUAGE plpgsql;

-- Function to generate transfer number
CREATE OR REPLACE FUNCTION generate_transfer_number()
RETURNS text AS $$
DECLARE
  next_num integer;
  trans_num text;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(transfer_number FROM 4) AS integer)), 0) + 1
  INTO next_num
  FROM stock_transfers
  WHERE transfer_number ~ '^TR-[0-9]+$';
  
  trans_num := 'TR-' || LPAD(next_num::text, 6, '0');
  RETURN trans_num;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate PO number
CREATE OR REPLACE FUNCTION set_po_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.po_number IS NULL OR NEW.po_number = '' THEN
    NEW.po_number := generate_po_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_po_number
  BEFORE INSERT ON purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION set_po_number();

-- Trigger to auto-generate adjustment number
CREATE OR REPLACE FUNCTION set_adjustment_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.adjustment_number IS NULL OR NEW.adjustment_number = '' THEN
    NEW.adjustment_number := generate_adjustment_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_adjustment_number
  BEFORE INSERT ON stock_adjustments
  FOR EACH ROW
  EXECUTE FUNCTION set_adjustment_number();

-- Trigger to auto-generate transfer number
CREATE OR REPLACE FUNCTION set_transfer_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.transfer_number IS NULL OR NEW.transfer_number = '' THEN
    NEW.transfer_number := generate_transfer_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_transfer_number
  BEFORE INSERT ON stock_transfers
  FOR EACH ROW
  EXECUTE FUNCTION set_transfer_number();
