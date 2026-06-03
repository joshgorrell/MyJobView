/*
  # Create Sales Orders Schema

  1. New Tables
    - `sales_orders`
      - `id` (uuid, primary key)
      - `company_id` (uuid, references profiles)
      - `proposal_id` (uuid, references proposals)
      - `contact_id` (uuid, references contacts)
      - `order_number` (text, unique per company)
      - `status` (text: planning, active, complete, closed)
      - `contract_total` (numeric)
      - `created_by` (uuid, references profiles)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `sales_orders` table
    - Add policies for company-based access

  3. Indexes
    - Index on company_id for performance
    - Index on proposal_id for lookups
    - Index on contact_id for customer views
*/

CREATE TABLE IF NOT EXISTS sales_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  proposal_id uuid REFERENCES proposals(id) ON DELETE SET NULL,
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  order_number text NOT NULL,
  status text NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'active', 'complete', 'closed')),
  contract_total numeric(10,2) NOT NULL DEFAULT 0,
  payment_terms text,
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(company_id, order_number)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sales_orders_company ON sales_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_proposal ON sales_orders(proposal_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_contact ON sales_orders(contact_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_status ON sales_orders(company_id, status);

-- Enable RLS
ALTER TABLE sales_orders ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view sales orders in their company"
  ON sales_orders FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can create sales orders in their company"
  ON sales_orders FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update sales orders in their company"
  ON sales_orders FOR UPDATE
  TO authenticated
  USING (
    company_id IN (
      SELECT id FROM profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete sales orders in their company"
  ON sales_orders FOR DELETE
  TO authenticated
  USING (
    company_id IN (
      SELECT id FROM profiles WHERE id = auth.uid()
    )
  );
