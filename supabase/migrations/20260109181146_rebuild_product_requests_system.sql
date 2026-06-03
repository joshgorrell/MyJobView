/*
  # Rebuild Product Requests System (formerly Parts Requests)

  1. Changes
    - Drop old parts_requests table
    - Create new product_requests table with correct schema
    - Create product_request_items table for multiple items per request
    - Add notification settings for who gets alerts
    
  2. New Tables
    - `product_requests` - Main request header
    - `product_request_items` - Line items for each request
    - `product_request_settings` - Configure who gets notified
    
  3. Security
    - Enable RLS on all tables
    - Users can create and view own requests
    - Admins and purchasing can manage all requests
*/

-- Drop old table
DROP TABLE IF EXISTS parts_requests CASCADE;
DROP TABLE IF EXISTS parts_usage_log CASCADE;

-- Create product_requests table
CREATE TABLE IF NOT EXISTS product_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by uuid REFERENCES profiles(id) ON DELETE SET NULL NOT NULL,
  request_type text NOT NULL CHECK (request_type IN ('job', 'stock', 'van')),
  work_order_id uuid REFERENCES work_orders(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  assigned_to uuid REFERENCES profiles(id) ON DELETE SET NULL,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'urgent')),
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'po_created', 'ordered', 'received')),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_product_requests_requested_by ON product_requests(requested_by);
CREATE INDEX idx_product_requests_work_order ON product_requests(work_order_id);
CREATE INDEX idx_product_requests_project ON product_requests(project_id);
CREATE INDEX idx_product_requests_status ON product_requests(status);
CREATE INDEX idx_product_requests_created_at ON product_requests(created_at);

-- Create product_request_items table
CREATE TABLE IF NOT EXISTS product_request_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid REFERENCES product_requests(id) ON DELETE CASCADE NOT NULL,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  model_number text,
  vendor text,
  quantity_requested integer NOT NULL CHECK (quantity_requested > 0),
  quantity_approved integer CHECK (quantity_approved >= 0),
  estimated_cost decimal(10, 2),
  assigned_to uuid REFERENCES profiles(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_product_request_items_request ON product_request_items(request_id);
CREATE INDEX idx_product_request_items_product ON product_request_items(product_id);

-- Create product_request_settings table
CREATE TABLE IF NOT EXISTS product_request_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_role text CHECK (notification_role IN ('admin', 'office_manager', 'purchasing', 'service_manager', 'production_manager')),
  notification_user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT one_notification_target CHECK (
    (notification_role IS NOT NULL AND notification_user_id IS NULL) OR
    (notification_role IS NULL AND notification_user_id IS NOT NULL)
  )
);

CREATE INDEX idx_product_request_settings_active ON product_request_settings(is_active) WHERE is_active = true;

-- Insert default settings (notify purchasing department)
INSERT INTO product_request_settings (notification_role, is_active)
VALUES ('purchasing', true)
ON CONFLICT DO NOTHING;

-- Enable RLS
ALTER TABLE product_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_request_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_request_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for product_requests
CREATE POLICY "Users can create product requests"
  ON product_requests FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = requested_by);

CREATE POLICY "Users can view own product requests"
  ON product_requests FOR SELECT
  TO authenticated
  USING (
    auth.uid() = requested_by
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager', 'purchasing', 'service_manager', 'production_manager')
    )
  );

CREATE POLICY "Users can update own product requests"
  ON product_requests FOR UPDATE
  TO authenticated
  USING (auth.uid() = requested_by)
  WITH CHECK (auth.uid() = requested_by);

CREATE POLICY "Managers can manage product requests"
  ON product_requests FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager', 'purchasing', 'service_manager', 'production_manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager', 'purchasing', 'service_manager', 'production_manager')
    )
  );

-- RLS Policies for product_request_items
CREATE POLICY "Users can create product request items"
  ON product_request_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM product_requests
      WHERE product_requests.id = product_request_items.request_id
      AND product_requests.requested_by = auth.uid()
    )
  );

CREATE POLICY "Users can view product request items"
  ON product_request_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM product_requests
      WHERE product_requests.id = product_request_items.request_id
      AND (
        product_requests.requested_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role IN ('admin', 'office_manager', 'purchasing', 'service_manager', 'production_manager')
        )
      )
    )
  );

CREATE POLICY "Managers can manage product request items"
  ON product_request_items FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager', 'purchasing', 'service_manager', 'production_manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager', 'purchasing', 'service_manager', 'production_manager')
    )
  );

-- RLS Policies for product_request_settings
CREATE POLICY "Admins can manage product request settings"
  ON product_request_settings FOR ALL
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

CREATE POLICY "Users can view product request settings"
  ON product_request_settings FOR SELECT
  TO authenticated
  USING (true);

-- Function to update product_requests timestamp
CREATE OR REPLACE FUNCTION update_product_request_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_product_request_timestamp
  BEFORE UPDATE ON product_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_product_request_timestamp();
