/*
  # Create Commissions Module Schema (Single Tenant)

  1. New Tables
    
    - `company_commission_settings`
      - Company-wide default commission rates and basis
      
    - `employee_commission_config`
      - Per-employee commission eligibility and custom rates
      
    - `commission_records`
      - Individual commission tracking records
      
    - `commission_adjustments`
      - Audit trail for all commission changes
      
    - `commission_payments`
      - Payment tracking for commissions
      
    - `project_commission_overrides`
      - Per-project commission rate overrides

  2. Security
    - Enable RLS on all tables
    - Admin can manage all commission data
    - Sales reps can view only their own commissions
*/

-- Company Commission Settings Table (Single Row)
CREATE TABLE IF NOT EXISTS company_commission_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_basis text NOT NULL DEFAULT 'gross' CHECK (commission_basis IN ('gross', 'profit')),
  default_sales_projects_rate decimal(5,2) NOT NULL DEFAULT 4.00,
  default_design_rate decimal(5,2) NOT NULL DEFAULT 1.00,
  default_pm_rate decimal(5,2) NOT NULL DEFAULT 2.00,
  default_service_sales_rate decimal(5,2) NOT NULL DEFAULT 5.00,
  default_service_pm_rate decimal(5,2) NOT NULL DEFAULT 2.00,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE company_commission_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage company commission settings"
  ON company_commission_settings
  FOR ALL
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

-- Employee Commission Config Table
CREATE TABLE IF NOT EXISTS employee_commission_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  eligible_for_commissions boolean DEFAULT false,
  custom_sales_projects_rate decimal(5,2),
  custom_design_rate decimal(5,2),
  custom_pm_rate decimal(5,2),
  custom_service_sales_rate decimal(5,2),
  custom_service_pm_rate decimal(5,2),
  design_credit_mode text DEFAULT 'auto' CHECK (design_credit_mode IN ('auto', 'manual')),
  bonus_tier_threshold decimal(12,2),
  bonus_tier_rate decimal(5,2),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(employee_id)
);

ALTER TABLE employee_commission_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage employee commission config"
  ON employee_commission_config
  FOR ALL
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

CREATE POLICY "Users can view own commission config"
  ON employee_commission_config
  FOR SELECT
  TO authenticated
  USING (employee_id = auth.uid());

-- Commission Records Table
CREATE TABLE IF NOT EXISTS commission_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  project_id uuid,
  invoice_id uuid,
  role_type text NOT NULL CHECK (role_type IN ('sales_projects', 'design', 'pm', 'service_sales', 'service_pm')),
  basis_type text NOT NULL CHECK (basis_type IN ('gross', 'profit')),
  basis_amount decimal(12,2) NOT NULL DEFAULT 0,
  commission_rate decimal(5,2) NOT NULL,
  total_potential_commission decimal(12,2) NOT NULL DEFAULT 0,
  amount_collected decimal(12,2) NOT NULL DEFAULT 0,
  amount_earned decimal(12,2) NOT NULL DEFAULT 0,
  amount_paid decimal(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accruing', 'ready_to_pay', 'paid')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE commission_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage all commission records"
  ON commission_records
  FOR ALL
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

CREATE POLICY "Users can view own commission records"
  ON commission_records
  FOR SELECT
  TO authenticated
  USING (employee_id = auth.uid());

-- Commission Adjustments Table (Audit Trail)
CREATE TABLE IF NOT EXISTS commission_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_record_id uuid NOT NULL REFERENCES commission_records(id) ON DELETE CASCADE,
  adjusted_by uuid NOT NULL REFERENCES profiles(id),
  adjustment_type text NOT NULL CHECK (adjustment_type IN ('rate_override', 'amount_override', 'refund', 'bonus', 'correction')),
  previous_value decimal(12,2),
  new_value decimal(12,2),
  reason text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE commission_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can view commission adjustments"
  ON commission_adjustments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admin can create commission adjustments"
  ON commission_adjustments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Commission Payments Table
CREATE TABLE IF NOT EXISTS commission_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_record_id uuid NOT NULL REFERENCES commission_records(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES profiles(id),
  amount_paid decimal(12,2) NOT NULL,
  payment_date date NOT NULL,
  payment_method text NOT NULL CHECK (payment_method IN ('payroll', 'check', 'direct', 'other')),
  reference_number text,
  notes text,
  processed_by uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE commission_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage commission payments"
  ON commission_payments
  FOR ALL
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

CREATE POLICY "Users can view own commission payments"
  ON commission_payments
  FOR SELECT
  TO authenticated
  USING (employee_id = auth.uid());

-- Project Commission Overrides Table
CREATE TABLE IF NOT EXISTS project_commission_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  role_type text NOT NULL CHECK (role_type IN ('sales_projects', 'design', 'pm', 'service_sales', 'service_pm')),
  override_rate decimal(5,2) NOT NULL,
  override_basis text CHECK (override_basis IN ('gross', 'profit')),
  reason text NOT NULL,
  created_by uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE project_commission_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage project commission overrides"
  ON project_commission_overrides
  FOR ALL
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

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_commission_records_employee ON commission_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_commission_records_status ON commission_records(status);
CREATE INDEX IF NOT EXISTS idx_commission_records_project ON commission_records(project_id);
CREATE INDEX IF NOT EXISTS idx_commission_payments_employee ON commission_payments(employee_id);
CREATE INDEX IF NOT EXISTS idx_commission_payments_date ON commission_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_employee_commission_config_employee ON employee_commission_config(employee_id);

-- Create updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at
DROP TRIGGER IF EXISTS update_company_commission_settings_updated_at ON company_commission_settings;
CREATE TRIGGER update_company_commission_settings_updated_at
  BEFORE UPDATE ON company_commission_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_employee_commission_config_updated_at ON employee_commission_config;
CREATE TRIGGER update_employee_commission_config_updated_at
  BEFORE UPDATE ON employee_commission_config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_commission_records_updated_at ON commission_records;
CREATE TRIGGER update_commission_records_updated_at
  BEFORE UPDATE ON commission_records
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Initialize company commission settings with defaults
INSERT INTO company_commission_settings (commission_basis, default_sales_projects_rate, default_design_rate, default_pm_rate, default_service_sales_rate, default_service_pm_rate)
VALUES ('gross', 4.00, 1.00, 2.00, 5.00, 2.00)
ON CONFLICT DO NOTHING;