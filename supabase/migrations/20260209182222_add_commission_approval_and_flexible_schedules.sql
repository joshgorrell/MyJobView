/*
  # Commission Approval Workflow and Flexible Payout Schedules

  1. Company Settings Enhancements
    - Add payroll_frequency (bi-weekly, semi-monthly, monthly, custom)
    - Add payroll_start_date for calculating pay periods
    - Add approval_required_threshold for automatic approval control
    
  2. Employee Config Enhancements
    - Add payout_schedule for individual schedules
    - Add effective_from and effective_to dates
    - Add monthly_cap and yearly_cap limits
    - Add commission_split_percentage for shared commissions
    
  3. Commission Records Enhancements
    - Add approval_status workflow fields
    - Add approved_by and approved_at tracking
    - Add rejected_reason and hold_reason
    - Add pay_period_start and pay_period_end
    
  4. Commission Payments Enhancements
    - Add batch_payment_id for grouping
    - Add payment_status tracking
    
  5. New Tables
    - commission_statements for tracking generated statements
    - commission_payment_batches for batch processing
    
  6. Security
    - Maintain existing RLS policies
    - Add Finance role access
*/

-- Add fields to company_commission_settings
ALTER TABLE company_commission_settings 
ADD COLUMN IF NOT EXISTS payroll_frequency text DEFAULT 'bi-weekly' 
  CHECK (payroll_frequency IN ('weekly', 'bi-weekly', 'semi-monthly', 'monthly', 'custom')),
ADD COLUMN IF NOT EXISTS payroll_start_date date DEFAULT CURRENT_DATE,
ADD COLUMN IF NOT EXISTS approval_required_threshold decimal(12,2) DEFAULT 1000.00,
ADD COLUMN IF NOT EXISTS auto_approve_under_threshold boolean DEFAULT true;

-- Add fields to employee_commission_config
ALTER TABLE employee_commission_config 
ADD COLUMN IF NOT EXISTS payout_schedule text DEFAULT 'company_default'
  CHECK (payout_schedule IN ('company_default', 'bi-weekly', 'semi-monthly', 'monthly', 'quarterly', 'custom')),
ADD COLUMN IF NOT EXISTS effective_from date,
ADD COLUMN IF NOT EXISTS effective_to date,
ADD COLUMN IF NOT EXISTS monthly_cap decimal(12,2),
ADD COLUMN IF NOT EXISTS yearly_cap decimal(12,2),
ADD COLUMN IF NOT EXISTS commission_split_percentage decimal(5,2) DEFAULT 100.00
  CHECK (commission_split_percentage > 0 AND commission_split_percentage <= 100);

-- Add fields to commission_records
ALTER TABLE commission_records
ADD COLUMN IF NOT EXISTS approval_status text DEFAULT 'pending_approval'
  CHECK (approval_status IN ('pending_approval', 'approved', 'rejected', 'auto_approved', 'on_hold')),
ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES profiles(id),
ADD COLUMN IF NOT EXISTS approved_at timestamptz,
ADD COLUMN IF NOT EXISTS rejected_reason text,
ADD COLUMN IF NOT EXISTS hold_reason text,
ADD COLUMN IF NOT EXISTS pay_period_start date,
ADD COLUMN IF NOT EXISTS pay_period_end date;

-- Add fields to commission_payments
ALTER TABLE commission_payments
ADD COLUMN IF NOT EXISTS batch_payment_id uuid,
ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'completed'
  CHECK (payment_status IN ('pending', 'processing', 'completed', 'failed', 'cancelled'));

-- Create commission_payment_batches table
CREATE TABLE IF NOT EXISTS commission_payment_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_number text UNIQUE NOT NULL,
  payment_date date NOT NULL,
  payment_method text NOT NULL CHECK (payment_method IN ('payroll', 'direct_deposit', 'check', 'manual', 'other')),
  total_amount decimal(12,2) NOT NULL DEFAULT 0,
  total_payments integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'processing', 'completed', 'cancelled')),
  reference_number text,
  notes text,
  processed_by uuid NOT NULL REFERENCES profiles(id),
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE commission_payment_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin and Finance can manage payment batches"
  ON commission_payment_batches
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'finance')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'finance')
    )
  );

-- Create commission_statements table
CREATE TABLE IF NOT EXISTS commission_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  statement_number text UNIQUE NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  total_commissions_earned decimal(12,2) NOT NULL DEFAULT 0,
  total_commissions_paid decimal(12,2) NOT NULL DEFAULT 0,
  total_commissions_pending decimal(12,2) NOT NULL DEFAULT 0,
  ytd_commissions decimal(12,2) NOT NULL DEFAULT 0,
  statement_data jsonb,
  pdf_path text,
  generated_by uuid NOT NULL REFERENCES profiles(id),
  generated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE commission_statements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin and Finance can manage statements"
  ON commission_statements
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'finance')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'finance')
    )
  );

CREATE POLICY "Users can view own statements"
  ON commission_statements
  FOR SELECT
  TO authenticated
  USING (employee_id = auth.uid());

-- Add foreign key for batch_payment_id in commission_payments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'commission_payments_batch_payment_id_fkey'
  ) THEN
    ALTER TABLE commission_payments
    ADD CONSTRAINT commission_payments_batch_payment_id_fkey
    FOREIGN KEY (batch_payment_id) 
    REFERENCES commission_payment_batches(id) 
    ON DELETE SET NULL;
  END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_commission_records_approval_status ON commission_records(approval_status);
CREATE INDEX IF NOT EXISTS idx_commission_records_approved_by ON commission_records(approved_by);
CREATE INDEX IF NOT EXISTS idx_commission_records_pay_period ON commission_records(pay_period_start, pay_period_end);
CREATE INDEX IF NOT EXISTS idx_commission_payments_batch ON commission_payments(batch_payment_id);
CREATE INDEX IF NOT EXISTS idx_commission_payments_status ON commission_payments(payment_status);
CREATE INDEX IF NOT EXISTS idx_commission_statements_employee ON commission_statements(employee_id);
CREATE INDEX IF NOT EXISTS idx_commission_statements_period ON commission_statements(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_payment_batches_status ON commission_payment_batches(status);
CREATE INDEX IF NOT EXISTS idx_payment_batches_date ON commission_payment_batches(payment_date);

-- Add trigger for payment batches updated_at
DROP TRIGGER IF EXISTS update_commission_payment_batches_updated_at ON commission_payment_batches;
CREATE TRIGGER update_commission_payment_batches_updated_at
  BEFORE UPDATE ON commission_payment_batches
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Update existing commission records RLS to allow Finance role
DROP POLICY IF EXISTS "Admin can manage all commission records" ON commission_records;
CREATE POLICY "Admin and Finance can manage all commission records"
  ON commission_records
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'finance')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'finance')
    )
  );

-- Update commission payments RLS to allow Finance role
DROP POLICY IF EXISTS "Admin can manage commission payments" ON commission_payments;
CREATE POLICY "Admin and Finance can manage commission payments"
  ON commission_payments
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'finance')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'finance')
    )
  );

-- Update commission adjustments RLS to allow Finance role  
DROP POLICY IF EXISTS "Admin can view commission adjustments" ON commission_adjustments;
CREATE POLICY "Admin and Finance can view commission adjustments"
  ON commission_adjustments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'finance')
    )
  );

DROP POLICY IF EXISTS "Admin can create commission adjustments" ON commission_adjustments;
CREATE POLICY "Admin and Finance can create commission adjustments"
  ON commission_adjustments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'finance')
    )
  );

-- Function to generate statement number
CREATE OR REPLACE FUNCTION generate_statement_number()
RETURNS text AS $$
DECLARE
  next_num integer;
  year_prefix text;
BEGIN
  year_prefix := TO_CHAR(CURRENT_DATE, 'YYYY');
  
  SELECT COALESCE(MAX(
    CASE 
      WHEN statement_number ~ ('^' || year_prefix || '-[0-9]+$')
      THEN CAST(SUBSTRING(statement_number FROM '[0-9]+$') AS integer)
      ELSE 0
    END
  ), 0) + 1
  INTO next_num
  FROM commission_statements
  WHERE statement_number LIKE year_prefix || '-%';
  
  RETURN year_prefix || '-' || LPAD(next_num::text, 4, '0');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to generate batch number
CREATE OR REPLACE FUNCTION generate_batch_number()
RETURNS text AS $$
DECLARE
  next_num integer;
  date_prefix text;
BEGIN
  date_prefix := TO_CHAR(CURRENT_DATE, 'YYYYMMDD');
  
  SELECT COALESCE(MAX(
    CASE 
      WHEN batch_number ~ ('^BATCH-' || date_prefix || '-[0-9]+$')
      THEN CAST(SUBSTRING(batch_number FROM '[0-9]+$') AS integer)
      ELSE 0
    END
  ), 0) + 1
  INTO next_num
  FROM commission_payment_batches
  WHERE batch_number LIKE 'BATCH-' || date_prefix || '-%';
  
  RETURN 'BATCH-' || date_prefix || '-' || LPAD(next_num::text, 3, '0');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;