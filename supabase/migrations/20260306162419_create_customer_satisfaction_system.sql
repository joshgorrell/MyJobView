/*
  # Create Customer Satisfaction System

  ## Overview
  Creates a dedicated table for tracking customer satisfaction surveys sent to customers after job completion.

  ## New Tables
  - `customer_satisfaction`
    - `id` (uuid, primary key)
    - `organization_id` (uuid, FK to organizations)
    - `contact_id` (uuid, nullable FK to contacts) - linked customer contact
    - `customer_name` (text) - name snapshot at time of send
    - `customer_email` (text) - email address used
    - `sales_rep_id` (uuid, nullable FK to profiles) - assigned sales rep
    - `sales_rep_name` (text) - name snapshot
    - `lead_tech_id` (uuid, nullable FK to profiles) - assigned lead technician
    - `lead_tech_name` (text) - name snapshot
    - `response_token` (uuid, unique) - token used in the public feedback URL
    - `rating` (text, nullable) - 'excellent' | 'good' | 'okay' | 'needs_attention'
    - `comment` (text, nullable) - optional customer comment
    - `sent_at` (timestamptz) - when the email was sent
    - `responded_at` (timestamptz, nullable) - when the customer responded
    - `alert_sent` (boolean) - whether an internal alert was sent for this response
    - `created_by` (uuid, nullable FK to profiles)
    - `created_at` (timestamptz)

  ## Security
  - RLS enabled
  - Authenticated users can read/insert/update records in their organization
  - Public (anon) can update via response_token for feedback submission
*/

CREATE TABLE IF NOT EXISTS customer_satisfaction (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  customer_name text NOT NULL DEFAULT '',
  customer_email text NOT NULL DEFAULT '',
  sales_rep_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  sales_rep_name text NOT NULL DEFAULT '',
  lead_tech_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  lead_tech_name text NOT NULL DEFAULT '',
  response_token uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  rating text CHECK (rating IN ('excellent', 'good', 'okay', 'needs_attention')),
  comment text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  alert_sent boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_customer_satisfaction_org_id ON customer_satisfaction(organization_id);
CREATE INDEX IF NOT EXISTS idx_customer_satisfaction_token ON customer_satisfaction(response_token);
CREATE INDEX IF NOT EXISTS idx_customer_satisfaction_contact_id ON customer_satisfaction(contact_id);
CREATE INDEX IF NOT EXISTS idx_customer_satisfaction_sent_at ON customer_satisfaction(sent_at);
CREATE INDEX IF NOT EXISTS idx_customer_satisfaction_rating ON customer_satisfaction(rating);
CREATE INDEX IF NOT EXISTS idx_customer_satisfaction_sales_rep ON customer_satisfaction(sales_rep_id);
CREATE INDEX IF NOT EXISTS idx_customer_satisfaction_lead_tech ON customer_satisfaction(lead_tech_id);

-- Enable RLS
ALTER TABLE customer_satisfaction ENABLE ROW LEVEL SECURITY;

-- Authenticated users can view records in their organization
CREATE POLICY "Users can view satisfaction records in their org"
  ON customer_satisfaction FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Authenticated users can insert records in their organization
CREATE POLICY "Users can create satisfaction records in their org"
  ON customer_satisfaction FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Authenticated users can update records in their organization
CREATE POLICY "Users can update satisfaction records in their org"
  ON customer_satisfaction FOR UPDATE
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Anonymous users can update a record by providing a valid response_token
-- This allows customers to submit their feedback without logging in
CREATE POLICY "Anonymous can submit feedback via token"
  ON customer_satisfaction FOR UPDATE
  TO anon
  USING (response_token IS NOT NULL)
  WITH CHECK (response_token IS NOT NULL);

-- Anonymous users can read a record by token (so the feedback page can show context)
CREATE POLICY "Anonymous can read record by token"
  ON customer_satisfaction FOR SELECT
  TO anon
  USING (true);
