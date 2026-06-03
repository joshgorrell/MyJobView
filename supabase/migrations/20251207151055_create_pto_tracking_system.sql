/*
  # Create PTO (Paid Time Off) Tracking System

  1. New Tables
    - `pto_policies` - Define PTO policies with accrual rules
    - `pto_balances` - Track current PTO balances for each employee
    - `pto_requests` - Employee time-off requests
    - `pto_accrual_history` - Historical record of PTO accruals
    
  2. Features
    - Multiple PTO types (vacation, sick, personal, bereavement, etc.)
    - Flexible accrual rules (per pay period, annually, custom)
    - Manager approval workflow
    - QuickBooks sync tracking
    - Balance calculations and rollover rules
    
  3. Security
    - Enable RLS on all tables
    - Employees can view own balances and create requests
    - Managers can approve/deny requests
    - Admins can manage policies and adjust balances
*/

-- PTO Policies Table
CREATE TABLE IF NOT EXISTS pto_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_name text NOT NULL,
  pto_type text NOT NULL CHECK (pto_type IN ('vacation', 'sick', 'personal', 'bereavement', 'jury_duty', 'unpaid')),
  description text,
  is_paid boolean DEFAULT true,
  accrual_method text NOT NULL CHECK (accrual_method IN ('per_pay_period', 'annually', 'custom', 'none')),
  accrual_rate numeric(10, 4) NOT NULL DEFAULT 0,
  accrual_frequency text CHECK (accrual_frequency IN ('biweekly', 'monthly', 'annually', 'per_hour_worked')),
  max_accrual_hours numeric(10, 2),
  max_carryover_hours numeric(10, 2),
  waiting_period_days integer DEFAULT 0,
  requires_approval boolean DEFAULT true,
  eligible_employment_types text[] DEFAULT ARRAY['hourly', 'salary'],
  is_active boolean DEFAULT true,
  qbo_payroll_item_id text,
  qbo_sync_enabled boolean DEFAULT false,
  qbo_last_synced_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- PTO Balances Table
CREATE TABLE IF NOT EXISTS pto_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  policy_id uuid NOT NULL REFERENCES pto_policies(id) ON DELETE CASCADE,
  current_balance_hours numeric(10, 2) NOT NULL DEFAULT 0,
  pending_hours numeric(10, 2) NOT NULL DEFAULT 0,
  used_hours_ytd numeric(10, 2) NOT NULL DEFAULT 0,
  accrued_hours_ytd numeric(10, 2) NOT NULL DEFAULT 0,
  last_accrual_date date,
  carryover_hours numeric(10, 2) DEFAULT 0,
  manual_adjustment_hours numeric(10, 2) DEFAULT 0,
  adjustment_reason text,
  qbo_synced boolean DEFAULT false,
  qbo_last_sync_error text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(employee_id, policy_id)
);

-- PTO Requests Table
CREATE TABLE IF NOT EXISTS pto_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  policy_id uuid NOT NULL REFERENCES pto_policies(id) ON DELETE RESTRICT,
  request_type text NOT NULL CHECK (request_type IN ('full_day', 'half_day', 'hours')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  total_hours numeric(10, 2) NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'cancelled')),
  submitted_at timestamptz DEFAULT now(),
  reviewed_by uuid REFERENCES profiles(id),
  reviewed_at timestamptz,
  review_notes text,
  qbo_synced boolean DEFAULT false,
  qbo_payroll_item_id text,
  qbo_last_synced_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- PTO Accrual History Table
CREATE TABLE IF NOT EXISTS pto_accrual_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  policy_id uuid NOT NULL REFERENCES pto_policies(id) ON DELETE CASCADE,
  accrual_date date NOT NULL,
  hours_accrued numeric(10, 2) NOT NULL,
  accrual_type text NOT NULL CHECK (accrual_type IN ('automatic', 'manual', 'carryover', 'adjustment')),
  notes text,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_pto_balances_employee ON pto_balances(employee_id);
CREATE INDEX IF NOT EXISTS idx_pto_balances_policy ON pto_balances(policy_id);
CREATE INDEX IF NOT EXISTS idx_pto_requests_employee ON pto_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_pto_requests_status ON pto_requests(status);
CREATE INDEX IF NOT EXISTS idx_pto_requests_dates ON pto_requests(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_pto_accrual_history_employee ON pto_accrual_history(employee_id);
CREATE INDEX IF NOT EXISTS idx_pto_accrual_history_date ON pto_accrual_history(accrual_date);

-- Enable RLS
ALTER TABLE pto_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE pto_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE pto_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE pto_accrual_history ENABLE ROW LEVEL SECURITY;

-- PTO Policies RLS
CREATE POLICY "Everyone can view active policies"
  ON pto_policies FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage policies"
  ON pto_policies FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- PTO Balances RLS
CREATE POLICY "Employees can view own balances"
  ON pto_balances FOR SELECT
  TO authenticated
  USING (employee_id = auth.uid());

CREATE POLICY "Managers can view team balances"
  ON pto_balances FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager', 'project_manager', 'service_manager')
    )
  );

CREATE POLICY "Admins can manage balances"
  ON pto_balances FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- PTO Requests RLS
CREATE POLICY "Employees can view own requests"
  ON pto_requests FOR SELECT
  TO authenticated
  USING (employee_id = auth.uid());

CREATE POLICY "Employees can create own requests"
  ON pto_requests FOR INSERT
  TO authenticated
  WITH CHECK (employee_id = auth.uid());

CREATE POLICY "Employees can update own pending requests"
  ON pto_requests FOR UPDATE
  TO authenticated
  USING (employee_id = auth.uid() AND status = 'pending');

CREATE POLICY "Managers can view all requests"
  ON pto_requests FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager', 'project_manager', 'service_manager')
    )
  );

CREATE POLICY "Managers can approve requests"
  ON pto_requests FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager', 'project_manager', 'service_manager')
    )
  );

-- PTO Accrual History RLS
CREATE POLICY "Employees can view own accrual history"
  ON pto_accrual_history FOR SELECT
  TO authenticated
  USING (employee_id = auth.uid());

CREATE POLICY "Managers can view all accrual history"
  ON pto_accrual_history FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager', 'project_manager', 'service_manager')
    )
  );

CREATE POLICY "Admins can manage accrual history"
  ON pto_accrual_history FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Function to update balance when request is approved
CREATE OR REPLACE FUNCTION update_pto_balance_on_approval()
RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status = 'pending' THEN
    UPDATE pto_balances
    SET 
      current_balance_hours = current_balance_hours - NEW.total_hours,
      pending_hours = pending_hours - NEW.total_hours,
      used_hours_ytd = used_hours_ytd + NEW.total_hours,
      updated_at = now()
    WHERE employee_id = NEW.employee_id
    AND policy_id = NEW.policy_id;
  ELSIF NEW.status = 'denied' AND OLD.status = 'pending' THEN
    UPDATE pto_balances
    SET 
      pending_hours = pending_hours - NEW.total_hours,
      updated_at = now()
    WHERE employee_id = NEW.employee_id
    AND policy_id = NEW.policy_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to reserve balance when request is created
CREATE OR REPLACE FUNCTION reserve_pto_balance()
RETURNS trigger AS $$
BEGIN
  UPDATE pto_balances
  SET 
    pending_hours = pending_hours + NEW.total_hours,
    updated_at = now()
  WHERE employee_id = NEW.employee_id
  AND policy_id = NEW.policy_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Triggers
DROP TRIGGER IF EXISTS trigger_update_pto_balance_on_approval ON pto_requests;
CREATE TRIGGER trigger_update_pto_balance_on_approval
  AFTER UPDATE ON pto_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_pto_balance_on_approval();

DROP TRIGGER IF EXISTS trigger_reserve_pto_balance ON pto_requests;
CREATE TRIGGER trigger_reserve_pto_balance
  AFTER INSERT ON pto_requests
  FOR EACH ROW
  EXECUTE FUNCTION reserve_pto_balance();

-- Seed default PTO policies
INSERT INTO pto_policies (policy_name, pto_type, description, accrual_method, accrual_rate, accrual_frequency, max_accrual_hours, max_carryover_hours, eligible_employment_types)
VALUES 
  ('Standard Vacation', 'vacation', 'Standard vacation time for full-time employees', 'per_pay_period', 3.08, 'biweekly', 160, 40, ARRAY['hourly', 'salary']),
  ('Sick Leave', 'sick', 'Paid sick leave for illness or medical appointments', 'per_pay_period', 1.54, 'biweekly', 80, 40, ARRAY['hourly', 'salary']),
  ('Personal Days', 'personal', 'Personal time off for any reason', 'annually', 24, 'annually', 24, 0, ARRAY['salary']),
  ('Bereavement', 'bereavement', 'Time off for family bereavement', 'none', 0, NULL, NULL, NULL, ARRAY['hourly', 'salary']),
  ('Jury Duty', 'jury_duty', 'Paid time for jury duty service', 'none', 0, NULL, NULL, NULL, ARRAY['hourly', 'salary']),
  ('Unpaid Time Off', 'unpaid', 'Unpaid time off', 'none', 0, NULL, NULL, NULL, ARRAY['hourly', 'salary', 'hourly_no_clock'])
ON CONFLICT DO NOTHING;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON pto_policies TO authenticated;
GRANT SELECT, INSERT, UPDATE ON pto_balances TO authenticated;
GRANT SELECT, INSERT, UPDATE ON pto_requests TO authenticated;
GRANT SELECT, INSERT ON pto_accrual_history TO authenticated;
