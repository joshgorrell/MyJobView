/*
  # Create Monitoring Services Catalog

  1. New Tables
    - `monitoring_services`
      - `id` (uuid, primary key)
      - `name` (text) - Service name
      - `description` (text) - Service description
      - `monthly_price` (numeric) - Monthly price for this service
      - `category` (text) - Category for grouping services
      - `is_active` (boolean) - Whether service is available for selection
      - `sort_order` (integer) - Display order
      - `created_at` (timestamptz)
    
    - `security_contract_services`
      - `id` (uuid, primary key)
      - `contract_id` (uuid) - Reference to security_contracts
      - `service_id` (uuid) - Reference to monitoring_services
      - `monthly_price` (numeric) - Price at time of contract creation
      - `created_at` (timestamptz)

  2. Changes to security_contracts table
    - Add `sales_order_id` (uuid, optional) - Reference to sales_orders
    - Add `monthly_price` (numeric) - Total monthly price (calculated or overridden)
    - Add `price_override` (numeric, optional) - Manual price override
    - Add `term_months` (integer) - Contract term in months (12, 24, 36, 48, 60)

  3. Security
    - Enable RLS on all tables
    - Add policies for authenticated users
*/

-- Create monitoring services catalog table
CREATE TABLE IF NOT EXISTS monitoring_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  monthly_price numeric(10,2) NOT NULL DEFAULT 0,
  category text,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Create junction table for contract services
CREATE TABLE IF NOT EXISTS security_contract_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES security_contracts(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES monitoring_services(id) ON DELETE RESTRICT,
  monthly_price numeric(10,2) NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(contract_id, service_id)
);

-- Add new columns to security_contracts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'security_contracts' AND column_name = 'sales_order_id'
  ) THEN
    ALTER TABLE security_contracts ADD COLUMN sales_order_id uuid REFERENCES sales_orders(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'security_contracts' AND column_name = 'monthly_price'
  ) THEN
    ALTER TABLE security_contracts ADD COLUMN monthly_price numeric(10,2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'security_contracts' AND column_name = 'price_override'
  ) THEN
    ALTER TABLE security_contracts ADD COLUMN price_override numeric(10,2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'security_contracts' AND column_name = 'term_months'
  ) THEN
    ALTER TABLE security_contracts ADD COLUMN term_months integer;
  END IF;
END $$;

-- Add check constraint for term_months
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage 
    WHERE constraint_name = 'security_contracts_term_months_check'
  ) THEN
    ALTER TABLE security_contracts 
    ADD CONSTRAINT security_contracts_term_months_check 
    CHECK (term_months IN (12, 24, 36, 48, 60));
  END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_monitoring_services_active ON monitoring_services(is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_monitoring_services_category ON monitoring_services(category);
CREATE INDEX IF NOT EXISTS idx_security_contract_services_contract ON security_contract_services(contract_id);
CREATE INDEX IF NOT EXISTS idx_security_contract_services_service ON security_contract_services(service_id);
CREATE INDEX IF NOT EXISTS idx_security_contracts_sales_order ON security_contracts(sales_order_id);

-- Enable RLS
ALTER TABLE monitoring_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_contract_services ENABLE ROW LEVEL SECURITY;

-- RLS Policies for monitoring_services
CREATE POLICY "Anyone can view active monitoring services"
  ON monitoring_services
  FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage monitoring services"
  ON monitoring_services
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner')
    )
  );

-- RLS Policies for security_contract_services
CREATE POLICY "Users can view contract services"
  ON security_contract_services
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM security_contracts
      WHERE security_contracts.id = contract_id
    )
  );

CREATE POLICY "Users can insert contract services"
  ON security_contract_services
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM security_contracts
      WHERE security_contracts.id = contract_id
    )
  );

CREATE POLICY "Users can delete contract services"
  ON security_contract_services
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM security_contracts
      WHERE security_contracts.id = contract_id
    )
  );

-- Insert default monitoring services
INSERT INTO monitoring_services (name, description, monthly_price, category, sort_order) VALUES
  ('Basic Monitoring', '24/7 professional monitoring with police, fire, and medical dispatch', 29.99, 'Monitoring', 1),
  ('Premium Monitoring', 'Enhanced monitoring with priority response and two-way voice', 49.99, 'Monitoring', 2),
  ('Video Monitoring', 'Live video verification and recording', 39.99, 'Video Services', 3),
  ('Smart Home Integration', 'Control lights, locks, and thermostats', 19.99, 'Smart Home', 4),
  ('Mobile App Access', 'Arm/disarm and receive alerts on your phone', 9.99, 'Add-ons', 5),
  ('Environmental Monitoring', 'Smoke, carbon monoxide, flood, and temperature sensors', 14.99, 'Add-ons', 6),
  ('Cellular Backup', 'Ensures connection even if internet goes down', 9.99, 'Add-ons', 7),
  ('Video Storage (7 days)', '7 days of cloud video storage', 19.99, 'Video Services', 8),
  ('Video Storage (30 days)', '30 days of cloud video storage', 39.99, 'Video Services', 9)
ON CONFLICT DO NOTHING;