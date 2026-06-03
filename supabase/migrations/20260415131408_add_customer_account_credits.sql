/*
  # Add Customer Account Credits System

  ## Summary
  Creates a table to track credit memos that are issued against a customer account
  (as opposed to credit memos that are absorbed by future billing on the same sales order).

  ## New Tables
  - `customer_account_credits`
    - `id` (uuid, primary key)
    - `organization_id` (uuid, FK to organizations)
    - `contact_id` (uuid, FK to contacts) — the customer being credited
    - `sales_order_id` (uuid, nullable FK to sales_orders) — the originating SO (if any)
    - `source_invoice_id` (uuid, FK to invoices) — the credit memo invoice that created this credit
    - `amount` (numeric) — positive number representing the full credit value (stored as positive)
    - `amount_applied` (numeric) — how much has been applied against future invoices or manually noted
    - `amount_remaining` (numeric) — computed: amount - amount_applied
    - `status` (text) — 'open' | 'fully_applied' | 'voided'
    - `notes` (text, nullable)
    - `created_by` (uuid)
    - `created_at` (timestamptz)
    - `updated_at` (timestamptz)

  ## Security
  - RLS enabled; authenticated users in same org can read/insert/update
  - Only admins or the creator can delete

  ## Notes
  1. amount_remaining is kept as a real column (not computed) for RLS-friendliness and query performance
  2. A trigger keeps amount_remaining in sync whenever amount or amount_applied changes
  3. status auto-updates to 'fully_applied' when amount_remaining <= 0
*/

CREATE TABLE IF NOT EXISTS customer_account_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT get_user_org_id() REFERENCES organizations(id),
  contact_id uuid NOT NULL REFERENCES contacts(id),
  sales_order_id uuid REFERENCES sales_orders(id),
  source_invoice_id uuid REFERENCES invoices(id),
  amount numeric NOT NULL DEFAULT 0 CHECK (amount >= 0),
  amount_applied numeric NOT NULL DEFAULT 0 CHECK (amount_applied >= 0),
  amount_remaining numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'fully_applied', 'voided')),
  notes text,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE customer_account_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read account credits"
  ON customer_account_credits FOR SELECT
  TO authenticated
  USING (organization_id = get_user_org_id());

CREATE POLICY "Org members can insert account credits"
  ON customer_account_credits FOR INSERT
  TO authenticated
  WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY "Org members can update account credits"
  ON customer_account_credits FOR UPDATE
  TO authenticated
  USING (organization_id = get_user_org_id())
  WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY "Admins can delete account credits"
  ON customer_account_credits FOR DELETE
  TO authenticated
  USING (
    organization_id = get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role = 'admin'
    )
  );

CREATE INDEX IF NOT EXISTS idx_customer_account_credits_contact ON customer_account_credits(contact_id);
CREATE INDEX IF NOT EXISTS idx_customer_account_credits_org ON customer_account_credits(organization_id);
CREATE INDEX IF NOT EXISTS idx_customer_account_credits_invoice ON customer_account_credits(source_invoice_id);
CREATE INDEX IF NOT EXISTS idx_customer_account_credits_so ON customer_account_credits(sales_order_id);

CREATE OR REPLACE FUNCTION sync_account_credit_remaining()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.amount_remaining := GREATEST(0, NEW.amount - NEW.amount_applied);
  NEW.updated_at := now();
  IF NEW.amount_remaining <= 0 AND NEW.status = 'open' THEN
    NEW.status := 'fully_applied';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_account_credit_remaining
  BEFORE INSERT OR UPDATE ON customer_account_credits
  FOR EACH ROW EXECUTE FUNCTION sync_account_credit_remaining();
