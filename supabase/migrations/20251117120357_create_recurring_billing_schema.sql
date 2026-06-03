/*
  # Create Recurring Billing System

  ## Summary
  Creates a comprehensive recurring billing system for managing subscriptions, recurring invoices,
  and automated billing cycles.

  ## New Tables
  
  ### `recurring_plans`
  - `id` (uuid, primary key)
  - `company_id` (uuid, references company_settings)
  - `plan_name` (text) - Name of the recurring plan
  - `description` (text) - Plan description
  - `billing_frequency` (text) - daily, weekly, monthly, quarterly, yearly
  - `amount` (decimal) - Base recurring amount
  - `tax_rate` (decimal) - Tax rate to apply
  - `is_active` (boolean) - Whether plan is active
  - `created_by` (uuid, references profiles)
  - `office_id` (uuid, references company_offices)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### `recurring_subscriptions`
  - `id` (uuid, primary key)
  - `company_id` (uuid, references company_settings)
  - `contact_id` (uuid, references contacts) - Customer subscribed
  - `plan_id` (uuid, references recurring_plans) - Plan they're subscribed to
  - `custom_amount` (decimal) - Override amount if different from plan
  - `start_date` (date) - When subscription starts
  - `end_date` (date) - When subscription ends (null for ongoing)
  - `next_billing_date` (date) - Next scheduled billing
  - `status` (text) - active, paused, cancelled, expired
  - `billing_day` (integer) - Day of month/week for billing
  - `auto_invoice` (boolean) - Automatically create invoices
  - `auto_send` (boolean) - Automatically send invoices
  - `notes` (text)
  - `created_by` (uuid, references profiles)
  - `office_id` (uuid, references company_offices)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### `recurring_invoices`
  - `id` (uuid, primary key)
  - `company_id` (uuid, references company_settings)
  - `subscription_id` (uuid, references recurring_subscriptions)
  - `invoice_id` (uuid, references invoices) - Generated invoice
  - `billing_period_start` (date)
  - `billing_period_end` (date)
  - `amount` (decimal)
  - `status` (text) - scheduled, generated, sent, paid, failed
  - `scheduled_date` (date) - When this should be generated
  - `generated_at` (timestamptz) - When invoice was actually created
  - `error_message` (text) - If generation failed
  - `created_at` (timestamptz)

  ### `subscription_line_items`
  - `id` (uuid, primary key)
  - `subscription_id` (uuid, references recurring_subscriptions)
  - `product_id` (uuid, references products)
  - `description` (text)
  - `quantity` (decimal)
  - `unit_price` (decimal)
  - `total` (decimal)
  - `created_at` (timestamptz)

  ## Security
  - Enable RLS on all tables
  - Add policies for authenticated users based on company membership
  - Office-based visibility using user_can_view_record() function

  ## Notes
  - Supports multiple billing frequencies
  - Tracks billing history through recurring_invoices
  - Allows custom amounts per subscription
  - Automatic invoice generation capability
*/

-- Create recurring_plans table
CREATE TABLE IF NOT EXISTS recurring_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES company_settings(id) ON DELETE CASCADE,
  plan_name text NOT NULL,
  description text,
  billing_frequency text NOT NULL CHECK (billing_frequency IN ('daily', 'weekly', 'monthly', 'quarterly', 'yearly')),
  amount decimal(10,2) NOT NULL DEFAULT 0,
  tax_rate decimal(5,4) DEFAULT 0,
  is_active boolean DEFAULT true,
  created_by uuid REFERENCES profiles(id),
  office_id uuid REFERENCES company_offices(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create recurring_subscriptions table
CREATE TABLE IF NOT EXISTS recurring_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES company_settings(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES contacts(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES recurring_plans(id) ON DELETE SET NULL,
  custom_amount decimal(10,2),
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  next_billing_date date NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled', 'expired')),
  billing_day integer CHECK (billing_day >= 1 AND billing_day <= 31),
  auto_invoice boolean DEFAULT true,
  auto_send boolean DEFAULT false,
  notes text,
  created_by uuid REFERENCES profiles(id),
  office_id uuid REFERENCES company_offices(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create recurring_invoices table
CREATE TABLE IF NOT EXISTS recurring_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES company_settings(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES recurring_subscriptions(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  billing_period_start date NOT NULL,
  billing_period_end date NOT NULL,
  amount decimal(10,2) NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'generated', 'sent', 'paid', 'failed')),
  scheduled_date date NOT NULL,
  generated_at timestamptz,
  error_message text,
  created_at timestamptz DEFAULT now()
);

-- Create subscription_line_items table
CREATE TABLE IF NOT EXISTS subscription_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid REFERENCES recurring_subscriptions(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  description text NOT NULL,
  quantity decimal(10,3) NOT NULL DEFAULT 1,
  unit_price decimal(10,2) NOT NULL DEFAULT 0,
  total decimal(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_recurring_plans_company ON recurring_plans(company_id);
CREATE INDEX IF NOT EXISTS idx_recurring_plans_active ON recurring_plans(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_recurring_subscriptions_company ON recurring_subscriptions(company_id);
CREATE INDEX IF NOT EXISTS idx_recurring_subscriptions_contact ON recurring_subscriptions(contact_id);
CREATE INDEX IF NOT EXISTS idx_recurring_subscriptions_next_billing ON recurring_subscriptions(next_billing_date) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_recurring_subscriptions_status ON recurring_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_recurring_invoices_subscription ON recurring_invoices(subscription_id);
CREATE INDEX IF NOT EXISTS idx_recurring_invoices_scheduled ON recurring_invoices(scheduled_date) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_subscription_line_items_subscription ON subscription_line_items(subscription_id);

-- Enable RLS
ALTER TABLE recurring_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_line_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for recurring_plans
CREATE POLICY "Users can view plans based on office visibility"
  ON recurring_plans FOR SELECT
  TO authenticated
  USING (
    user_can_view_record(office_id, created_by)
  );

CREATE POLICY "Sales and admin can insert plans"
  ON recurring_plans FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'sales', 'sales_manager')
    )
  );

CREATE POLICY "Sales and admin can update plans"
  ON recurring_plans FOR UPDATE
  TO authenticated
  USING (
    user_can_view_record(office_id, created_by)
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'sales', 'sales_manager')
    )
  );

CREATE POLICY "Admin can delete plans"
  ON recurring_plans FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role = 'admin'
    )
  );

-- RLS Policies for recurring_subscriptions
CREATE POLICY "Users can view subscriptions based on office visibility"
  ON recurring_subscriptions FOR SELECT
  TO authenticated
  USING (
    user_can_view_record(office_id, created_by)
  );

CREATE POLICY "Sales can insert subscriptions"
  ON recurring_subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'sales', 'sales_manager', 'office_manager')
    )
  );

CREATE POLICY "Sales can update subscriptions"
  ON recurring_subscriptions FOR UPDATE
  TO authenticated
  USING (
    user_can_view_record(office_id, created_by)
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'sales', 'sales_manager', 'office_manager')
    )
  );

CREATE POLICY "Sales can delete subscriptions"
  ON recurring_subscriptions FOR DELETE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'sales_manager')
    )
  );

-- RLS Policies for recurring_invoices
CREATE POLICY "Users can view recurring invoices based on subscription visibility"
  ON recurring_invoices FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM recurring_subscriptions
      WHERE id = subscription_id
      AND user_can_view_record(office_id, created_by)
    )
  );

CREATE POLICY "System can insert recurring invoices"
  ON recurring_invoices FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "System can update recurring invoices"
  ON recurring_invoices FOR UPDATE
  TO authenticated
  USING (true);

-- RLS Policies for subscription_line_items
CREATE POLICY "Users can view subscription line items"
  ON subscription_line_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM recurring_subscriptions
      WHERE id = subscription_id
      AND user_can_view_record(office_id, created_by)
    )
  );

CREATE POLICY "Users can insert subscription line items"
  ON subscription_line_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM recurring_subscriptions
      WHERE id = subscription_id
    )
  );

CREATE POLICY "Users can update subscription line items"
  ON subscription_line_items FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM recurring_subscriptions
      WHERE id = subscription_id
      AND user_can_view_record(office_id, created_by)
    )
  );

CREATE POLICY "Users can delete subscription line items"
  ON subscription_line_items FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM recurring_subscriptions
      WHERE id = subscription_id
      AND user_can_view_record(office_id, created_by)
    )
  );

-- Create trigger to set office_id and created_by for recurring tables
CREATE TRIGGER trigger_set_recurring_plan_office_owner
  BEFORE INSERT ON recurring_plans
  FOR EACH ROW
  EXECUTE FUNCTION set_record_office_and_owner();

CREATE TRIGGER trigger_set_recurring_subscription_office_owner
  BEFORE INSERT ON recurring_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION set_record_office_and_owner();

-- Create function to calculate next billing date
CREATE OR REPLACE FUNCTION calculate_next_billing_date(
  p_date date,
  p_frequency text,
  p_billing_day integer DEFAULT NULL
)
RETURNS date
LANGUAGE plpgsql
AS $$
BEGIN
  CASE p_frequency
    WHEN 'daily' THEN
      RETURN p_date + INTERVAL '1 day';
    WHEN 'weekly' THEN
      RETURN p_date + INTERVAL '1 week';
    WHEN 'monthly' THEN
      IF p_billing_day IS NOT NULL THEN
        -- Bill on specific day of month
        RETURN (date_trunc('month', p_date) + INTERVAL '1 month' + (p_billing_day - 1 || ' days')::interval)::date;
      ELSE
        RETURN p_date + INTERVAL '1 month';
      END IF;
    WHEN 'quarterly' THEN
      RETURN p_date + INTERVAL '3 months';
    WHEN 'yearly' THEN
      RETURN p_date + INTERVAL '1 year';
    ELSE
      RETURN p_date + INTERVAL '1 month';
  END CASE;
END;
$$;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add update triggers
CREATE TRIGGER update_recurring_plans_updated_at
  BEFORE UPDATE ON recurring_plans
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_recurring_subscriptions_updated_at
  BEFORE UPDATE ON recurring_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
