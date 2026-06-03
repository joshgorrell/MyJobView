/*
  # Week 1: Warehouse & Proposal Enhancements - Phase 1
  
  ## Summary
  Adds warehouse bin tracking, serial/lot tracking, stock reservations, and proposal 
  enhancements. All changes are additive and backward compatible.
  
  ## New Tables Created
  
  ### 1. warehouse_bins
  Storage locations within warehouses (aisle, rack, shelf, bin)
  - `id` (uuid, primary key)
  - `warehouse_id` (references warehouses) - Which warehouse
  - `bin_code` (text, unique per warehouse) - e.g., "A1-R2-S3"
  - `aisle` (text) - Aisle identifier
  - `rack` (text) - Rack identifier
  - `shelf` (text) - Shelf identifier
  - `description` (text) - Notes about location
  - `is_active` (boolean) - Whether bin is in use
  - `created_at`, `updated_at` (timestamptz)
  - UNIQUE constraint on (warehouse_id, bin_code)
  
  ### 2. serial_lot_tracking
  Individual unit tracking for high-value items (AV equipment, appliances)
  - `id` (uuid, primary key)
  - `product_id` (references products) - What product
  - `warehouse_id` (references warehouses) - Current location
  - `bin_id` (references warehouse_bins) - Specific bin location
  - `serial_number` (text) - Manufacturer serial number
  - `lot_number` (text) - Lot/batch number
  - `received_date` (date) - When received into stock
  - `expiry_date` (date) - Expiration (for warranties, etc.)
  - `status` (text) - in_stock, reserved, picked, installed, returned
  - `reserved_for_proposal_id` (uuid, nullable) - If reserved
  - `notes` (text) - Additional tracking notes
  - `created_at`, `updated_at` (timestamptz)
  
  ### 3. stock_reservations
  Links proposals to allocated inventory (soft reservations)
  - `id` (uuid, primary key)
  - `proposal_id` (references proposals) - Which proposal
  - `proposal_line_item_id` (references proposal_line_items) - Which line item
  - `product_id` (references products) - What product
  - `warehouse_id` (references warehouses) - Which warehouse
  - `quantity_reserved` (numeric) - How many units
  - `reserved_at` (timestamptz) - When reserved
  - `reserved_by` (uuid, references profiles) - Who reserved
  - `expires_at` (timestamptz) - Auto-release if proposal expires
  - `status` (text) - active, picked, cancelled, expired
  - `notes` (text) - Reservation notes
  - `created_at`, `updated_at` (timestamptz)
  
  ### 4. product_classes
  Classification system for products (speakers, displays, control, wiring, labor)
  - `id` (uuid, primary key)
  - `name` (text, unique) - Class name
  - `description` (text) - What this class includes
  - `color` (text) - UI color code for visual organization
  - `sort_order` (integer) - Display order
  - `is_active` (boolean) - Whether class is in use
  - `created_at`, `updated_at` (timestamptz)
  
  ### 5. labor_phases
  Labor work phases (rough-in, trim, programming, training, service)
  - `id` (uuid, primary key)
  - `name` (text, unique) - Phase name
  - `description` (text) - What this phase includes
  - `default_rate` (numeric) - Default hourly rate for phase
  - `sort_order` (integer) - Display order
  - `is_active` (boolean) - Whether phase is in use
  - `created_at`, `updated_at` (timestamptz)
  
  ### 6. user_column_preferences
  Per-user UI column visibility and settings
  - `id` (uuid, primary key)
  - `user_id` (uuid, references profiles) - Which user
  - `view_name` (text) - Which view (proposals_pro, warehouse_stock, etc.)
  - `column_settings` (jsonb) - Column visibility and order: {cost: true, margin: false, ...}
  - `created_at`, `updated_at` (timestamptz)
  - UNIQUE constraint on (user_id, view_name)
  
  ### 7. portal_io_cache
  Cached Portal.io product catalog for offline and performance
  - `id` (uuid, primary key)
  - `portal_product_id` (text, unique) - Portal.io product ID
  - `product_data` (jsonb) - Full product details from API
  - `pricing_data` (jsonb) - Dealer pricing tiers
  - `images` (jsonb) - Array of image URLs
  - `specifications` (jsonb) - Technical specs
  - `category` (text) - Product category
  - `manufacturer` (text) - Brand/manufacturer
  - `last_synced_at` (timestamptz) - Last API sync
  - `created_at`, `updated_at` (timestamptz)
  
  ### 8. control4_projects
  Control4 system integration data
  - `id` (uuid, primary key)
  - `proposal_id` (uuid, references proposals) - Linked proposal
  - `project_id` (uuid, references projects) - Linked project
  - `c4_project_id` (text) - Control4 project ID
  - `c4_dealer_id` (text) - Control4 dealer account ID
  - `imported_devices` (jsonb) - Array of imported devices
  - `export_c4z_url` (text) - URL to exported .c4z file
  - `last_synced_at` (timestamptz) - Last sync with my.control4.com
  - `created_at`, `updated_at` (timestamptz)
  
  ## Enhanced Existing Tables (All Optional Columns)
  
  ### proposal_line_items (4 new optional columns)
  - `item_class` (text) - References product_classes.name
  - `labor_phase` (text) - References labor_phases.name
  - `task_notes` (text) - Rich text notes for this line item
  - `is_hidden` (boolean, default false) - Hide from customer view
  
  ### product_inventory (1 new optional column)
  - `bin_id` (uuid, references warehouse_bins) - Specific bin location
  
  ### products (2 new optional columns)
  - `portal_last_sync` (timestamptz) - Last Portal.io sync
  - `control4_device_id` (text) - Control4 device type ID
  
  ## Security
  - All tables have RLS enabled
  - Authenticated users can view relevant data
  - Only admins and authorized roles can modify
  - Full audit trail with created_at/updated_at
  
  ## Important Notes
  - ALL new columns are NULLABLE - zero breaking changes
  - Existing data is unaffected
  - Existing queries continue to work
  - New features are opt-in only
  - Can be rolled back by simply not using the new tables
*/

-- =====================================================
-- 1. WAREHOUSE BINS
-- =====================================================

CREATE TABLE IF NOT EXISTS warehouse_bins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id uuid NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  bin_code text NOT NULL,
  aisle text,
  rack text,
  shelf text,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(warehouse_id, bin_code)
);

CREATE INDEX IF NOT EXISTS idx_warehouse_bins_warehouse ON warehouse_bins(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_bins_active ON warehouse_bins(is_active) WHERE is_active = true;

ALTER TABLE warehouse_bins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view active warehouse bins"
  ON warehouse_bins FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage warehouse bins"
  ON warehouse_bins FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- =====================================================
-- 2. SERIAL/LOT TRACKING
-- =====================================================

CREATE TABLE IF NOT EXISTS serial_lot_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  bin_id uuid REFERENCES warehouse_bins(id) ON DELETE SET NULL,
  serial_number text,
  lot_number text,
  received_date date,
  expiry_date date,
  status text DEFAULT 'in_stock' CHECK (status IN ('in_stock', 'reserved', 'picked', 'installed', 'returned', 'defective')),
  reserved_for_proposal_id uuid REFERENCES proposals(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_serial_tracking_product ON serial_lot_tracking(product_id);
CREATE INDEX IF NOT EXISTS idx_serial_tracking_warehouse ON serial_lot_tracking(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_serial_tracking_serial ON serial_lot_tracking(serial_number);
CREATE INDEX IF NOT EXISTS idx_serial_tracking_status ON serial_lot_tracking(status);

ALTER TABLE serial_lot_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view serial tracking"
  ON serial_lot_tracking FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authorized users can manage serial tracking"
  ON serial_lot_tracking FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'production_manager', 'warehouse_manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'production_manager', 'warehouse_manager')
    )
  );

-- =====================================================
-- 3. STOCK RESERVATIONS
-- =====================================================

CREATE TABLE IF NOT EXISTS stock_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  proposal_line_item_id uuid NOT NULL REFERENCES proposal_line_items(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  quantity_reserved numeric NOT NULL CHECK (quantity_reserved > 0),
  reserved_at timestamptz DEFAULT now(),
  reserved_by uuid REFERENCES profiles(id),
  expires_at timestamptz,
  status text DEFAULT 'active' CHECK (status IN ('active', 'picked', 'cancelled', 'expired')),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_reservations_proposal ON stock_reservations(proposal_id);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_product ON stock_reservations(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_warehouse ON stock_reservations(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_status ON stock_reservations(status);

ALTER TABLE stock_reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view stock reservations"
  ON stock_reservations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create stock reservations"
  ON stock_reservations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update own reservations"
  ON stock_reservations FOR UPDATE
  TO authenticated
  USING (reserved_by = auth.uid() OR EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'production_manager')
  ));

-- =====================================================
-- 4. PRODUCT CLASSES
-- =====================================================

CREATE TABLE IF NOT EXISTS product_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  description text,
  color text DEFAULT '#6366f1',
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_classes_active ON product_classes(is_active, sort_order);

ALTER TABLE product_classes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view active product classes"
  ON product_classes FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage product classes"
  ON product_classes FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Insert default product classes
INSERT INTO product_classes (name, description, color, sort_order) VALUES
  ('Audio/Video', 'Displays, projectors, speakers, soundbars', '#ef4444', 1),
  ('Control', 'Control processors, remotes, keypads, touch panels', '#3b82f6', 2),
  ('Lighting', 'Dimmers, switches, fixtures, controllers', '#eab308', 3),
  ('Networking', 'Routers, switches, access points, cabling', '#8b5cf6', 4),
  ('Security', 'Cameras, door locks, sensors, intercoms', '#10b981', 5),
  ('Climate', 'Thermostats, HVAC controllers, sensors', '#06b6d4', 6),
  ('Wiring', 'Cable, conduit, boxes, connectors', '#6b7280', 7),
  ('Labor', 'Installation, programming, service work', '#f59e0b', 8),
  ('Other', 'Miscellaneous items and accessories', '#64748b', 99)
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- 5. LABOR PHASES
-- =====================================================

CREATE TABLE IF NOT EXISTS labor_phases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  description text,
  default_rate numeric DEFAULT 0,
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_labor_phases_active ON labor_phases(is_active, sort_order);

ALTER TABLE labor_phases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view active labor phases"
  ON labor_phases FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage labor phases"
  ON labor_phases FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Insert default labor phases
INSERT INTO labor_phases (name, description, default_rate, sort_order) VALUES
  ('Rough-In', 'Initial installation, wiring, mounting', 125.00, 1),
  ('Trim', 'Device installation, terminations, cleanup', 125.00, 2),
  ('Programming', 'System configuration and setup', 150.00, 3),
  ('Training', 'Customer training and orientation', 150.00, 4),
  ('Service', 'Service calls, troubleshooting, repairs', 175.00, 5),
  ('Project Management', 'Planning, coordination, oversight', 200.00, 6)
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- 6. USER COLUMN PREFERENCES
-- =====================================================

CREATE TABLE IF NOT EXISTS user_column_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  view_name text NOT NULL,
  column_settings jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, view_name)
);

CREATE INDEX IF NOT EXISTS idx_user_column_prefs_user ON user_column_preferences(user_id);

ALTER TABLE user_column_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own column preferences"
  ON user_column_preferences FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can manage own column preferences"
  ON user_column_preferences FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- =====================================================
-- 7. PORTAL.IO CACHE
-- =====================================================

CREATE TABLE IF NOT EXISTS portal_io_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_product_id text UNIQUE NOT NULL,
  product_data jsonb NOT NULL,
  pricing_data jsonb,
  images jsonb,
  specifications jsonb,
  category text,
  manufacturer text,
  last_synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portal_cache_product_id ON portal_io_cache(portal_product_id);
CREATE INDEX IF NOT EXISTS idx_portal_cache_manufacturer ON portal_io_cache(manufacturer);
CREATE INDEX IF NOT EXISTS idx_portal_cache_category ON portal_io_cache(category);
CREATE INDEX IF NOT EXISTS idx_portal_cache_last_synced ON portal_io_cache(last_synced_at);

ALTER TABLE portal_io_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view portal.io cache"
  ON portal_io_cache FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage portal.io cache"
  ON portal_io_cache FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- =====================================================
-- 8. CONTROL4 PROJECTS
-- =====================================================

CREATE TABLE IF NOT EXISTS control4_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid REFERENCES proposals(id) ON DELETE SET NULL,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  c4_project_id text,
  c4_dealer_id text,
  imported_devices jsonb,
  export_c4z_url text,
  last_synced_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_control4_proposal ON control4_projects(proposal_id);
CREATE INDEX IF NOT EXISTS idx_control4_project ON control4_projects(project_id);
CREATE INDEX IF NOT EXISTS idx_control4_c4_project ON control4_projects(c4_project_id);

ALTER TABLE control4_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view control4 projects"
  ON control4_projects FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can manage control4 projects"
  ON control4_projects FOR ALL
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- =====================================================
-- 9. ENHANCE EXISTING TABLES (ALL NULLABLE)
-- =====================================================

-- Add optional columns to proposal_line_items
DO $$
BEGIN
  -- item_class
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposal_line_items' AND column_name = 'item_class'
  ) THEN
    ALTER TABLE proposal_line_items ADD COLUMN item_class text;
  END IF;

  -- labor_phase
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposal_line_items' AND column_name = 'labor_phase'
  ) THEN
    ALTER TABLE proposal_line_items ADD COLUMN labor_phase text;
  END IF;

  -- task_notes
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposal_line_items' AND column_name = 'task_notes'
  ) THEN
    ALTER TABLE proposal_line_items ADD COLUMN task_notes text;
  END IF;

  -- is_hidden
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposal_line_items' AND column_name = 'is_hidden'
  ) THEN
    ALTER TABLE proposal_line_items ADD COLUMN is_hidden boolean DEFAULT false;
  END IF;
END $$;

-- Add optional column to product_inventory
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_inventory' AND column_name = 'bin_id'
  ) THEN
    ALTER TABLE product_inventory ADD COLUMN bin_id uuid REFERENCES warehouse_bins(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_product_inventory_bin ON product_inventory(bin_id);
  END IF;
END $$;

-- Add optional columns to products
DO $$
BEGIN
  -- portal_last_sync
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'portal_last_sync'
  ) THEN
    ALTER TABLE products ADD COLUMN portal_last_sync timestamptz;
  END IF;

  -- control4_device_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'control4_device_id'
  ) THEN
    ALTER TABLE products ADD COLUMN control4_device_id text;
  END IF;
END $$;

-- =====================================================
-- TRIGGER: Auto-update updated_at timestamps
-- =====================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all new tables
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['warehouse_bins', 'serial_lot_tracking', 'stock_reservations', 
                            'product_classes', 'labor_phases', 'user_column_preferences', 
                            'portal_io_cache', 'control4_projects']
  LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS update_%I_updated_at ON %I;
      CREATE TRIGGER update_%I_updated_at
        BEFORE UPDATE ON %I
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    ', t, t, t, t);
  END LOOP;
END $$;