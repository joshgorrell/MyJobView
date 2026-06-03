/*
  # Create Security Contract Cancellation System

  1. New Tables
    - `security_contract_cancellations`
      - `id` (uuid, primary key)
      - `contract_id` (uuid, references security_contracts)
      - `contact_id` (uuid, references contacts)
      - `cancellation_reason` (text) - reason for cancellation
      - `custom_reason` (text) - if they select "other"
      - `requested_end_date` (date) - when they want service to end
      - `contract_end_date` (date) - actual contract end date
      - `months_remaining` (integer) - months left on contract
      - `buyout_amount` (numeric) - amount to pay if early termination
      - `is_early_termination` (boolean) - true if more than 90 days left
      - `status` (text) - pending, approved, completed, cancelled
      - `notes` (text) - internal notes
      - `processed_by` (uuid, references profiles)
      - `processed_at` (timestamp)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on `security_contract_cancellations` table
    - Add policies for portal users to create and view their own cancellations
    - Add policies for admin/finance to view and process all cancellations
*/

CREATE TABLE IF NOT EXISTS security_contract_cancellations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid REFERENCES security_contracts(id) ON DELETE CASCADE NOT NULL,
  contact_id uuid REFERENCES contacts(id) ON DELETE CASCADE NOT NULL,
  cancellation_reason text NOT NULL CHECK (cancellation_reason IN (
    'found_better_company',
    'moving',
    'not_using_enough',
    'found_better_price',
    'financial_reasons',
    'switching_to_self_monitoring',
    'other'
  )),
  custom_reason text,
  requested_end_date date NOT NULL,
  contract_end_date date NOT NULL,
  months_remaining integer NOT NULL,
  monthly_rate numeric(10, 2) NOT NULL,
  buyout_amount numeric(10, 2) DEFAULT 0,
  is_early_termination boolean DEFAULT false,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'completed', 'cancelled')),
  notes text,
  processed_by uuid REFERENCES profiles(id),
  processed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE security_contract_cancellations ENABLE ROW LEVEL SECURITY;

-- Portal users can create cancellation requests for their own contracts
CREATE POLICY "Portal users can create own cancellation requests"
  ON security_contract_cancellations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    contact_id IN (
      SELECT contact_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Portal users can view their own cancellation requests
CREATE POLICY "Portal users can view own cancellation requests"
  ON security_contract_cancellations
  FOR SELECT
  TO authenticated
  USING (
    contact_id IN (
      SELECT contact_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Admin and Finance can view all cancellation requests
CREATE POLICY "Admin and Finance can view all cancellation requests"
  ON security_contract_cancellations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'finance')
    )
  );

-- Admin and Finance can update cancellation requests
CREATE POLICY "Admin and Finance can update cancellation requests"
  ON security_contract_cancellations
  FOR UPDATE
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

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_cancellations_contract_id ON security_contract_cancellations(contract_id);
CREATE INDEX IF NOT EXISTS idx_cancellations_contact_id ON security_contract_cancellations(contact_id);
CREATE INDEX IF NOT EXISTS idx_cancellations_status ON security_contract_cancellations(status);
CREATE INDEX IF NOT EXISTS idx_cancellations_created_at ON security_contract_cancellations(created_at DESC);

-- Add cancellation_requested_at and final_billing_date to security_contracts
ALTER TABLE security_contracts
ADD COLUMN IF NOT EXISTS cancellation_requested_at timestamptz,
ADD COLUMN IF NOT EXISTS final_billing_date date,
ADD COLUMN IF NOT EXISTS cancellation_reason text;
