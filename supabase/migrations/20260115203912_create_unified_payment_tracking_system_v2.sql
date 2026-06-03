/*
  # Create Unified Payment Tracking System

  ## Summary
  Creates a comprehensive payment tracking system for all payment types (VIP subscriptions, security contracts, regular invoices) to work with QuickBooks hosted payment pages.

  ## New Tables

  ### `subscription_payments`
  Tracks payments for VIP subscriptions (add missing columns if table exists)
  
  ### `pending_payments`
  Tracks payments awaiting completion via QuickBooks hosted pages
  - `id` (uuid, primary key)
  - `payment_type` (text) - 'vip_subscription', 'security_contract', 'invoice'
  - `related_id` (uuid) - ID of subscription/contract/invoice
  - `contact_id` (uuid, references contacts)
  - `amount` (decimal)
  - `qbo_invoice_id` (text) - Created invoice in QuickBooks
  - `status` (text) - 'awaiting_payment', 'paid', 'expired', 'cancelled'
  - `initiated_at` (timestamptz)
  - `completed_at` (timestamptz)
  - `expires_at` (timestamptz)
  - `metadata` (jsonb) - Additional data
  - `created_at` (timestamptz)

  ## Security
  - Enable RLS on all tables
  - Add policies for authenticated users and system access

  ## Notes
  - Unifies payment tracking across all payment types
  - Enables QuickBooks hosted payment page workflow
  - Tracks payment lifecycle from initiation to completion
*/

-- Create subscription_payments table if not exists
CREATE TABLE IF NOT EXISTS subscription_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid REFERENCES recurring_subscriptions(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES contacts(id) ON DELETE CASCADE,
  amount decimal(10,2) NOT NULL,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  payment_method text,
  qbo_payment_id text,
  reference_number text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Add qbo_invoice_id if it doesn't exist (from previous migration)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscription_payments' AND column_name = 'qbo_invoice_id'
  ) THEN
    ALTER TABLE subscription_payments ADD COLUMN qbo_invoice_id text;
  END IF;
END $$;

-- Create pending_payments table
CREATE TABLE IF NOT EXISTS pending_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_type text NOT NULL CHECK (payment_type IN ('vip_subscription', 'security_contract', 'invoice')),
  related_id uuid NOT NULL,
  contact_id uuid REFERENCES contacts(id) ON DELETE CASCADE,
  amount decimal(10,2) NOT NULL,
  qbo_invoice_id text,
  status text NOT NULL DEFAULT 'awaiting_payment' CHECK (status IN ('awaiting_payment', 'paid', 'expired', 'cancelled')),
  initiated_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  expires_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_subscription_payments_subscription ON subscription_payments(subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_contact ON subscription_payments(contact_id);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_qbo_payment_id ON subscription_payments(qbo_payment_id);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_qbo_invoice_id ON subscription_payments(qbo_invoice_id);
CREATE INDEX IF NOT EXISTS idx_pending_payments_contact ON pending_payments(contact_id);
CREATE INDEX IF NOT EXISTS idx_pending_payments_qbo_invoice_id ON pending_payments(qbo_invoice_id);
CREATE INDEX IF NOT EXISTS idx_pending_payments_status ON pending_payments(status);
CREATE INDEX IF NOT EXISTS idx_pending_payments_type_related ON pending_payments(payment_type, related_id);

-- Enable RLS
ALTER TABLE subscription_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_payments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can view subscription payments" ON subscription_payments;
  DROP POLICY IF EXISTS "System can insert subscription payments" ON subscription_payments;
  DROP POLICY IF EXISTS "System can update subscription payments" ON subscription_payments;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

-- RLS Policies for subscription_payments
CREATE POLICY "Users can view subscription payments"
  ON subscription_payments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM recurring_subscriptions rs
      WHERE rs.id = subscription_id
      AND user_can_view_record(rs.office_id, rs.created_by)
    )
  );

CREATE POLICY "System can insert subscription payments"
  ON subscription_payments FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "System can update subscription payments"
  ON subscription_payments FOR UPDATE
  TO authenticated
  USING (true);

-- RLS Policies for pending_payments
CREATE POLICY "Users can view their pending payments"
  ON pending_payments FOR SELECT
  TO authenticated
  USING (
    contact_id IN (
      SELECT contact_id FROM profiles WHERE id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'sales', 'sales_manager', 'office_manager', 'finance')
    )
  );

CREATE POLICY "System can insert pending payments"
  ON pending_payments FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "System can update pending payments"
  ON pending_payments FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Portal users can view own pending payments"
  ON pending_payments FOR SELECT
  TO authenticated
  USING (
    contact_id IN (
      SELECT contact_id FROM profiles WHERE id = auth.uid()
    )
  );
