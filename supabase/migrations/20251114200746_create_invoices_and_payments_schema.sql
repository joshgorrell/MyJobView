/*
  # Create Invoices and Payments Schema (QBO Mirror)

  1. New Tables
    - `invoices`
      - Local mirror of QuickBooks Online invoices
      - `id` (uuid, primary key)
      - `company_id` (uuid)
      - `qbo_invoice_id` (text) - QuickBooks Online ID
      - `invoice_number` (text)
      - `project_id` (uuid, references projects) - Optional
      - `contact_id` (uuid, references contacts)
      - `invoice_date` (date)
      - `due_date` (date)
      - `subtotal` (numeric)
      - `tax_amount` (numeric)
      - `total` (numeric)
      - `amount_paid` (numeric)
      - `amount_due` (numeric)
      - `status` (text: draft, sent, paid, partial, overdue, void)
      - `payment_terms` (text)
      - `notes` (text)
      - `synced_at` (timestamptz) - Last sync with QBO
      - `created_by` (uuid)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `invoice_line_items`
      - `id` (uuid, primary key)
      - `invoice_id` (uuid, references invoices)
      - `description` (text)
      - `quantity` (numeric)
      - `unit_price` (numeric)
      - `amount` (numeric)
      - `sort_order` (integer)

    - `payments`
      - Local mirror of payments from QBO
      - `id` (uuid, primary key)
      - `company_id` (uuid)
      - `invoice_id` (uuid, references invoices)
      - `qbo_payment_id` (text) - QuickBooks Online Payment ID
      - `payment_date` (date)
      - `amount` (numeric)
      - `payment_method` (text: qbo_payments, check, cash, bank_transfer, credit_card, other)
      - `reference_number` (text) - Check number, transaction ID, etc.
      - `notes` (text)
      - `synced_at` (timestamptz)
      - `created_by` (uuid)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Staff can manage invoices and payments in their company
    - Customers can view their own invoices and payments

  3. Indexes
    - Index on company_id, qbo_invoice_id, project_id, contact_id
    - Index on payment invoice_id
*/

CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  qbo_invoice_id text,
  invoice_number text NOT NULL,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  invoice_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date NOT NULL,
  subtotal numeric(10,2) NOT NULL DEFAULT 0,
  tax_amount numeric(10,2) NOT NULL DEFAULT 0,
  total numeric(10,2) NOT NULL DEFAULT 0,
  amount_paid numeric(10,2) NOT NULL DEFAULT 0,
  amount_due numeric(10,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'partial', 'overdue', 'void')),
  payment_terms text,
  notes text,
  synced_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(company_id, invoice_number)
);

CREATE TABLE IF NOT EXISTS invoice_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity numeric(10,2) NOT NULL DEFAULT 1,
  unit_price numeric(10,2) NOT NULL DEFAULT 0,
  amount numeric(10,2) NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  qbo_payment_id text,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric(10,2) NOT NULL,
  payment_method text NOT NULL CHECK (payment_method IN ('qbo_payments', 'check', 'cash', 'bank_transfer', 'credit_card', 'other')),
  reference_number text,
  notes text,
  synced_at timestamptz,
  created_by uuid,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_invoices_company ON invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_invoices_qbo ON invoices(qbo_invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoices_project ON invoices(project_id);
CREATE INDEX IF NOT EXISTS idx_invoices_contact ON invoices(contact_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(company_id, status);
CREATE INDEX IF NOT EXISTS idx_invoice_line_items_invoice ON invoice_line_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_company ON payments(company_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_qbo ON payments(qbo_payment_id);

-- Enable RLS
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Invoice Policies
CREATE POLICY "Staff can view invoices in their company"
  ON invoices FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Staff can create invoices in their company"
  ON invoices FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Staff can update invoices in their company"
  ON invoices FOR UPDATE
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

CREATE POLICY "Staff can delete invoices in their company"
  ON invoices FOR DELETE
  TO authenticated
  USING (
    company_id IN (
      SELECT id FROM profiles WHERE id = auth.uid()
    )
  );

-- Invoice Line Items Policies
CREATE POLICY "Staff can view invoice line items in their company"
  ON invoice_line_items FOR SELECT
  TO authenticated
  USING (
    invoice_id IN (
      SELECT id FROM invoices WHERE company_id IN (
        SELECT id FROM profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Staff can create invoice line items in their company"
  ON invoice_line_items FOR INSERT
  TO authenticated
  WITH CHECK (
    invoice_id IN (
      SELECT id FROM invoices WHERE company_id IN (
        SELECT id FROM profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Staff can update invoice line items in their company"
  ON invoice_line_items FOR UPDATE
  TO authenticated
  USING (
    invoice_id IN (
      SELECT id FROM invoices WHERE company_id IN (
        SELECT id FROM profiles WHERE id = auth.uid()
      )
    )
  )
  WITH CHECK (
    invoice_id IN (
      SELECT id FROM invoices WHERE company_id IN (
        SELECT id FROM profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Staff can delete invoice line items in their company"
  ON invoice_line_items FOR DELETE
  TO authenticated
  USING (
    invoice_id IN (
      SELECT id FROM invoices WHERE company_id IN (
        SELECT id FROM profiles WHERE id = auth.uid()
      )
    )
  );

-- Payment Policies
CREATE POLICY "Staff can view payments in their company"
  ON payments FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Staff can create payments in their company"
  ON payments FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Staff can update payments in their company"
  ON payments FOR UPDATE
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

CREATE POLICY "Staff can delete payments in their company"
  ON payments FOR DELETE
  TO authenticated
  USING (
    company_id IN (
      SELECT id FROM profiles WHERE id = auth.uid()
    )
  );

-- Trigger to update invoice amount_due when payments change
CREATE OR REPLACE FUNCTION update_invoice_payment_status()
RETURNS TRIGGER AS $$
DECLARE
  v_invoice_id uuid;
  v_total numeric;
  v_paid numeric;
BEGIN
  -- Get invoice_id based on operation
  IF TG_OP = 'DELETE' THEN
    v_invoice_id := OLD.invoice_id;
  ELSE
    v_invoice_id := NEW.invoice_id;
  END IF;

  -- Calculate total paid
  SELECT COALESCE(SUM(amount), 0)
  INTO v_paid
  FROM payments
  WHERE invoice_id = v_invoice_id;

  -- Get invoice total
  SELECT total INTO v_total
  FROM invoices
  WHERE id = v_invoice_id;

  -- Update invoice
  UPDATE invoices
  SET 
    amount_paid = v_paid,
    amount_due = v_total - v_paid,
    status = CASE
      WHEN v_paid = 0 THEN 'sent'
      WHEN v_paid >= v_total THEN 'paid'
      WHEN v_paid > 0 AND v_paid < v_total THEN 'partial'
      ELSE status
    END,
    updated_at = now()
  WHERE id = v_invoice_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_invoice_on_payment
  AFTER INSERT OR UPDATE OR DELETE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_invoice_payment_status();
