/*
  # Create Test & Tune Performance Bonus System

  ## Summary
  Implements the 90-Day Test & Tune Performance Bonus System that tracks labor efficiency
  after project completion and calculates performance bonuses for field teams and PMs.
  Integrates with existing Punchlist system for comprehensive post-completion tracking.

  ## New Tables

  ### labor_categories
  Lookup table for work order labor classification (Field, PM, Non-Performance).
  - `id` (uuid, primary key)
  - `name` (text) - Category name
  - `description` (text) - Description of what qualifies
  - `counts_against_target` (boolean) - If true, counts toward field labor budget
  - `display_color` (text) - Badge color for UI
  - `sort_order` (integer) - Display order
  - `active` (boolean) - Can be selected
  - `created_at` (timestamptz)

  ### test_tune_performance_snapshots
  Daily snapshots of labor totals during 90-day period.
  - `id` (uuid, primary key)
  - `sales_order_id` (uuid, references sales_orders)
  - `snapshot_date` (date) - Date of snapshot
  - `total_field_hours` (numeric) - Cumulative field labor hours
  - `total_pm_hours` (numeric) - Cumulative PM hours
  - `total_non_performance_hours` (numeric) - Cumulative non-performance hours
  - `field_labor_target` (numeric) - Target at time of snapshot
  - `percentage_of_target` (numeric) - Calculated percentage
  - `created_at` (timestamptz)

  ### test_tune_bonus_calculations
  Bonus calculation records at Day 90 evaluation.
  - `id` (uuid, primary key)
  - `sales_order_id` (uuid, references sales_orders)
  - `evaluation_date` (date) - Day 90 date
  - `total_estimated_labor` (numeric) - From proposal
  - `field_labor_target` (numeric) - 95% of estimated
  - `total_field_hours` (numeric) - Actual field labor used
  - `labor_savings_hours` (numeric) - Target minus actual
  - `labor_burden_rate` (numeric) - Cost per hour
  - `total_savings_amount` (numeric) - Savings in dollars
  - `bonus_tier` (text) - on_target, tier_1, tier_2, tier_3, over_target
  - `bonus_percentage` (numeric) - Applied percentage
  - `total_bonus_amount` (numeric) - Calculated bonus
  - `tech_bonus_amount` (numeric) - 65% portion
  - `pm_bonus_amount` (numeric) - 35% portion
  - `lead_technician_id` (uuid, references profiles)
  - `project_manager_id` (uuid, references profiles)
  - `status` (text) - provisional, approved, denied, paid
  - `notes` (text)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### test_tune_bonus_approvals
  Admin approval workflow and overrides.
  - `id` (uuid, primary key)
  - `bonus_calculation_id` (uuid, references test_tune_bonus_calculations)
  - `reviewed_by` (uuid, references profiles)
  - `review_date` (timestamptz)
  - `action` (text) - approved, denied, adjusted
  - `override_bonus_amount` (numeric) - Manual adjustment
  - `override_reason` (text) - Required for adjustments
  - `labor_burden_override` (numeric) - Override hourly rate
  - `bonus_percentage_override` (numeric) - Override percentage
  - `approved_at` (timestamptz)
  - `created_at` (timestamptz)

  ### test_tune_bonus_history
  Complete audit trail of all bonus modifications.
  - `id` (uuid, primary key)
  - `bonus_calculation_id` (uuid, references test_tune_bonus_calculations)
  - `changed_by` (uuid, references profiles)
  - `change_type` (text) - calculated, approved, denied, adjusted, unlocked, paid
  - `old_values` (jsonb) - Previous state
  - `new_values` (jsonb) - New state
  - `reason` (text) - Explanation
  - `created_at` (timestamptz)

  ### test_tune_settings
  System-wide configuration for bonus calculations.
  - `id` (uuid, primary key)
  - `on_target_bonus_amount` (numeric) - Flat bonus for hitting target exactly
  - `tier_1_min_hours` (numeric) - Min hours saved for tier 1
  - `tier_1_max_hours` (numeric) - Max hours saved for tier 1
  - `tier_1_percentage` (numeric) - Bonus percentage for tier 1
  - `tier_2_min_hours` (numeric) - Min hours saved for tier 2
  - `tier_2_max_hours` (numeric) - Max hours saved for tier 2
  - `tier_2_percentage` (numeric) - Bonus percentage for tier 2
  - `tier_3_min_hours` (numeric) - Min hours saved for tier 3
  - `tier_3_percentage` (numeric) - Bonus percentage for tier 3
  - `default_labor_burden_rate` (numeric) - Default cost per hour
  - `tech_bonus_percentage` (numeric) - Default 65
  - `pm_bonus_percentage` (numeric) - Default 35
  - `test_tune_period_days` (integer) - Default 90
  - `auto_evaluate_enabled` (boolean) - Enable automatic Day 90 calculation
  - `notification_roles` (jsonb) - Roles to notify
  - `updated_at` (timestamptz)

  ## Sales Orders Extensions
  - `total_estimated_labor_hours` (numeric) - From proposal line items
  - `field_labor_target_hours` (numeric) - 95% of estimated
  - `pm_labor_allocation_hours` (numeric) - Allocated PM time
  - `labor_burden_rate` (numeric) - Cost per hour for this order
  - `test_tune_status` (text) - null, active, paused, pending_approval, completed
  - `test_tune_start_date` (date) - When 90-day period started
  - `test_tune_end_date` (date) - Day 90 date
  - `test_tune_paused` (boolean) - Temporarily paused
  - `test_tune_pause_reason` (text) - Why paused
  - `lead_technician_id` (uuid) - Primary tech for bonus allocation

  ## Work Orders Extensions
  - `labor_category_id` (uuid, references labor_categories) - Required classification

  ## Security
  - Enable RLS on all tables
  - Admin and Finance can view/manage all bonus data
  - PMs and Techs can view their own bonuses only
  - Staff can view test & tune dashboards
  - Comprehensive audit logging

  ## Indexes
  - Index on sales_order_id for fast lookups
  - Index on test_tune_status for dashboard queries
  - Index on evaluation_date for Day 90 checks
  - Index on labor_category_id for work order filtering
*/

-- Add columns to sales_orders table
ALTER TABLE sales_orders 
  ADD COLUMN IF NOT EXISTS total_estimated_labor_hours numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS field_labor_target_hours numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pm_labor_allocation_hours numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS labor_burden_rate numeric DEFAULT 65.00,
  ADD COLUMN IF NOT EXISTS test_tune_status text CHECK (test_tune_status IN ('active', 'paused', 'pending_approval', 'completed')),
  ADD COLUMN IF NOT EXISTS test_tune_start_date date,
  ADD COLUMN IF NOT EXISTS test_tune_end_date date,
  ADD COLUMN IF NOT EXISTS test_tune_paused boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS test_tune_pause_reason text,
  ADD COLUMN IF NOT EXISTS lead_technician_id uuid REFERENCES profiles(id) ON DELETE SET NULL;

-- Create labor_categories table
CREATE TABLE IF NOT EXISTS labor_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text NOT NULL,
  counts_against_target boolean NOT NULL DEFAULT false,
  display_color text NOT NULL DEFAULT 'gray',
  sort_order integer NOT NULL DEFAULT 0,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Insert default labor categories
INSERT INTO labor_categories (name, description, counts_against_target, display_color, sort_order, active)
VALUES 
  ('Field Labor', 'Installation, repair, and hands-on work at customer site. Counts toward performance target.', true, 'blue', 1, true),
  ('PM Labor', 'Project management, coordination, and administrative work. Tracked separately from field target.', false, 'purple', 2, true),
  ('Non-Performance Labor', 'Warranty work, callbacks, customer-reported issues, and rework. Does not count toward target.', false, 'red', 3, true)
ON CONFLICT (name) DO NOTHING;

-- Add labor_category_id to work_orders table
ALTER TABLE work_orders 
  ADD COLUMN IF NOT EXISTS labor_category_id uuid REFERENCES labor_categories(id) ON DELETE RESTRICT;

-- Create index on work_orders labor_category_id
CREATE INDEX IF NOT EXISTS idx_work_orders_labor_category ON work_orders(labor_category_id);

-- Create test_tune_performance_snapshots table
CREATE TABLE IF NOT EXISTS test_tune_performance_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id uuid NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  total_field_hours numeric NOT NULL DEFAULT 0,
  total_pm_hours numeric NOT NULL DEFAULT 0,
  total_non_performance_hours numeric NOT NULL DEFAULT 0,
  field_labor_target numeric NOT NULL DEFAULT 0,
  percentage_of_target numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(sales_order_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_test_tune_snapshots_order ON test_tune_performance_snapshots(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_test_tune_snapshots_date ON test_tune_performance_snapshots(snapshot_date DESC);

-- Create test_tune_bonus_calculations table
CREATE TABLE IF NOT EXISTS test_tune_bonus_calculations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id uuid NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  evaluation_date date NOT NULL DEFAULT CURRENT_DATE,
  total_estimated_labor numeric NOT NULL DEFAULT 0,
  field_labor_target numeric NOT NULL DEFAULT 0,
  total_field_hours numeric NOT NULL DEFAULT 0,
  labor_savings_hours numeric NOT NULL DEFAULT 0,
  labor_burden_rate numeric NOT NULL DEFAULT 65.00,
  total_savings_amount numeric NOT NULL DEFAULT 0,
  bonus_tier text NOT NULL CHECK (bonus_tier IN ('on_target', 'tier_1', 'tier_2', 'tier_3', 'over_target')),
  bonus_percentage numeric NOT NULL DEFAULT 0,
  total_bonus_amount numeric NOT NULL DEFAULT 0,
  tech_bonus_amount numeric NOT NULL DEFAULT 0,
  pm_bonus_amount numeric NOT NULL DEFAULT 0,
  lead_technician_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  project_manager_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'provisional' CHECK (status IN ('provisional', 'approved', 'denied', 'paid')),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bonus_calculations_order ON test_tune_bonus_calculations(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_bonus_calculations_status ON test_tune_bonus_calculations(status);
CREATE INDEX IF NOT EXISTS idx_bonus_calculations_eval_date ON test_tune_bonus_calculations(evaluation_date DESC);
CREATE INDEX IF NOT EXISTS idx_bonus_calculations_tech ON test_tune_bonus_calculations(lead_technician_id);
CREATE INDEX IF NOT EXISTS idx_bonus_calculations_pm ON test_tune_bonus_calculations(project_manager_id);

-- Create test_tune_bonus_approvals table
CREATE TABLE IF NOT EXISTS test_tune_bonus_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bonus_calculation_id uuid NOT NULL REFERENCES test_tune_bonus_calculations(id) ON DELETE CASCADE,
  reviewed_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  review_date timestamptz NOT NULL DEFAULT now(),
  action text NOT NULL CHECK (action IN ('approved', 'denied', 'adjusted')),
  override_bonus_amount numeric,
  override_reason text,
  labor_burden_override numeric,
  bonus_percentage_override numeric,
  approved_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bonus_approvals_calculation ON test_tune_bonus_approvals(bonus_calculation_id);
CREATE INDEX IF NOT EXISTS idx_bonus_approvals_reviewer ON test_tune_bonus_approvals(reviewed_by);

-- Create test_tune_bonus_history table
CREATE TABLE IF NOT EXISTS test_tune_bonus_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bonus_calculation_id uuid NOT NULL REFERENCES test_tune_bonus_calculations(id) ON DELETE CASCADE,
  changed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  change_type text NOT NULL CHECK (change_type IN ('calculated', 'approved', 'denied', 'adjusted', 'unlocked', 'paid')),
  old_values jsonb,
  new_values jsonb,
  reason text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bonus_history_calculation ON test_tune_bonus_history(bonus_calculation_id, created_at DESC);

-- Create test_tune_settings table
CREATE TABLE IF NOT EXISTS test_tune_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  on_target_bonus_amount numeric NOT NULL DEFAULT 500.00,
  tier_1_min_hours numeric NOT NULL DEFAULT 1,
  tier_1_max_hours numeric NOT NULL DEFAULT 5,
  tier_1_percentage numeric NOT NULL DEFAULT 10,
  tier_2_min_hours numeric NOT NULL DEFAULT 6,
  tier_2_max_hours numeric NOT NULL DEFAULT 10,
  tier_2_percentage numeric NOT NULL DEFAULT 15,
  tier_3_min_hours numeric NOT NULL DEFAULT 11,
  tier_3_percentage numeric NOT NULL DEFAULT 20,
  default_labor_burden_rate numeric NOT NULL DEFAULT 65.00,
  tech_bonus_percentage numeric NOT NULL DEFAULT 65,
  pm_bonus_percentage numeric NOT NULL DEFAULT 35,
  test_tune_period_days integer NOT NULL DEFAULT 90,
  auto_evaluate_enabled boolean DEFAULT true,
  notification_roles jsonb DEFAULT '["admin", "finance", "production_manager"]'::jsonb,
  updated_at timestamptz DEFAULT now()
);

-- Insert default settings if not exists
INSERT INTO test_tune_settings (id)
SELECT gen_random_uuid()
WHERE NOT EXISTS (SELECT 1 FROM test_tune_settings LIMIT 1);

-- Enable RLS on all tables
ALTER TABLE labor_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_tune_performance_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_tune_bonus_calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_tune_bonus_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_tune_bonus_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_tune_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for labor_categories (all authenticated users can view)
CREATE POLICY "All authenticated users can view labor categories"
  ON labor_categories FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage labor categories"
  ON labor_categories FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));

-- RLS Policies for test_tune_performance_snapshots
CREATE POLICY "Staff can view test tune snapshots"
  ON test_tune_performance_snapshots FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND role IN ('admin', 'finance', 'production_manager', 'sales_manager', 'office_manager')
  ));

CREATE POLICY "System can insert snapshots"
  ON test_tune_performance_snapshots FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- RLS Policies for test_tune_bonus_calculations
CREATE POLICY "Staff can view bonus calculations"
  ON test_tune_bonus_calculations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'finance', 'production_manager', 'sales_manager', 'office_manager')
    )
    OR lead_technician_id = auth.uid()
    OR project_manager_id = auth.uid()
  );

CREATE POLICY "System can create bonus calculations"
  ON test_tune_bonus_calculations FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Finance and Admin can update bonus calculations"
  ON test_tune_bonus_calculations FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND role IN ('admin', 'finance')
  ));

-- RLS Policies for test_tune_bonus_approvals
CREATE POLICY "Staff can view bonus approvals"
  ON test_tune_bonus_approvals FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND role IN ('admin', 'finance', 'production_manager', 'sales_manager')
  ));

CREATE POLICY "Finance and Admin can create approvals"
  ON test_tune_bonus_approvals FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND role IN ('admin', 'finance')
  ));

-- RLS Policies for test_tune_bonus_history
CREATE POLICY "Staff can view bonus history"
  ON test_tune_bonus_history FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND role IN ('admin', 'finance', 'production_manager', 'sales_manager')
  ));

CREATE POLICY "System can insert bonus history"
  ON test_tune_bonus_history FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- RLS Policies for test_tune_settings
CREATE POLICY "Staff can view test tune settings"
  ON test_tune_settings FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND role IN ('admin', 'finance', 'production_manager', 'sales_manager', 'office_manager')
  ));

CREATE POLICY "Admins can update test tune settings"
  ON test_tune_settings FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));

-- Create trigger to log bonus calculation changes
CREATE OR REPLACE FUNCTION log_bonus_calculation_change()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO test_tune_bonus_history (bonus_calculation_id, changed_by, change_type, new_values)
    VALUES (NEW.id, auth.uid(), 'calculated', to_jsonb(NEW));
  ELSIF (TG_OP = 'UPDATE') THEN
    IF (OLD.status != NEW.status) THEN
      INSERT INTO test_tune_bonus_history (bonus_calculation_id, changed_by, change_type, old_values, new_values, reason)
      VALUES (NEW.id, auth.uid(), NEW.status, 
        jsonb_build_object('status', OLD.status, 'total_bonus_amount', OLD.total_bonus_amount),
        jsonb_build_object('status', NEW.status, 'total_bonus_amount', NEW.total_bonus_amount),
        NEW.notes);
    ELSE
      INSERT INTO test_tune_bonus_history (bonus_calculation_id, changed_by, change_type, old_values, new_values)
      VALUES (NEW.id, auth.uid(), 'adjusted', to_jsonb(OLD), to_jsonb(NEW));
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_log_bonus_calculation_change
  AFTER INSERT OR UPDATE ON test_tune_bonus_calculations
  FOR EACH ROW
  EXECUTE FUNCTION log_bonus_calculation_change();

-- Create function to calculate current labor hours for a sales order
CREATE OR REPLACE FUNCTION get_test_tune_labor_totals(p_sales_order_id uuid)
RETURNS TABLE (
  field_hours numeric,
  pm_hours numeric,
  non_performance_hours numeric,
  total_hours numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(CASE 
      WHEN lc.counts_against_target = true AND lc.name = 'Field Labor' 
      THEN wo.actual_hours 
      ELSE 0 
    END), 0) as field_hours,
    COALESCE(SUM(CASE 
      WHEN lc.name = 'PM Labor' 
      THEN wo.actual_hours 
      ELSE 0 
    END), 0) as pm_hours,
    COALESCE(SUM(CASE 
      WHEN lc.name = 'Non-Performance Labor' 
      THEN wo.actual_hours 
      ELSE 0 
    END), 0) as non_performance_hours,
    COALESCE(SUM(wo.actual_hours), 0) as total_hours
  FROM work_orders wo
  LEFT JOIN labor_categories lc ON lc.id = wo.labor_category_id
  WHERE wo.sales_order_id = p_sales_order_id
    AND wo.status = 'completed';
END;
$$;