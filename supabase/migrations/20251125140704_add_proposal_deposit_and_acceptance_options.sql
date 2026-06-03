/*
  # Add Proposal Deposit and Acceptance Options

  1. Changes to proposal_settings
    - Add `deposit_type` - 'percentage', 'parts_total', or 'none'
    - Add `acceptance_methods` - array of allowed methods: 'payment', 'purchase_order'
    - Add `require_deposit` - boolean flag

  2. Changes to proposals
    - Add `parts_total` - calculated total of all parts (excluding labor)
    - Add `labor_total` - calculated total of all labor
    - Add `deposit_amount_due` - calculated deposit amount based on settings
    - Add `purchase_order_number` - if customer accepts via PO
    - Add `purchase_order_file_url` - uploaded PO document
    - Add `deposit_invoice_id` - link to generated deposit invoice

  3. Security
    - Update RLS policies for new fields
    - Allow customers to upload PO files
*/

-- Add new columns to proposal_settings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposal_settings' AND column_name = 'deposit_type'
  ) THEN
    ALTER TABLE proposal_settings ADD COLUMN deposit_type text DEFAULT 'percentage' CHECK (deposit_type IN ('percentage', 'parts_total', 'none'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposal_settings' AND column_name = 'acceptance_methods'
  ) THEN
    ALTER TABLE proposal_settings ADD COLUMN acceptance_methods text[] DEFAULT ARRAY['payment']::text[];
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposal_settings' AND column_name = 'require_deposit'
  ) THEN
    ALTER TABLE proposal_settings ADD COLUMN require_deposit boolean DEFAULT true;
  END IF;
END $$;

-- Add new columns to proposals
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposals' AND column_name = 'parts_total'
  ) THEN
    ALTER TABLE proposals ADD COLUMN parts_total numeric(10,2) DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposals' AND column_name = 'labor_total'
  ) THEN
    ALTER TABLE proposals ADD COLUMN labor_total numeric(10,2) DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposals' AND column_name = 'deposit_amount_due'
  ) THEN
    ALTER TABLE proposals ADD COLUMN deposit_amount_due numeric(10,2) DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposals' AND column_name = 'purchase_order_number'
  ) THEN
    ALTER TABLE proposals ADD COLUMN purchase_order_number text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposals' AND column_name = 'purchase_order_file_url'
  ) THEN
    ALTER TABLE proposals ADD COLUMN purchase_order_file_url text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposals' AND column_name = 'deposit_invoice_id'
  ) THEN
    ALTER TABLE proposals ADD COLUMN deposit_invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposals' AND column_name = 'accepted_via_method'
  ) THEN
    ALTER TABLE proposals ADD COLUMN accepted_via_method text CHECK (accepted_via_method IN ('payment', 'purchase_order', NULL));
  END IF;
END $$;

-- Create storage bucket for purchase orders
INSERT INTO storage.buckets (id, name, public)
VALUES ('purchase-orders', 'purchase-orders', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for purchase orders (drop and recreate)
DO $$
BEGIN
  DROP POLICY IF EXISTS "Authenticated users can upload purchase orders" ON storage.objects;
  DROP POLICY IF EXISTS "Anyone can view purchase orders" ON storage.objects;
  DROP POLICY IF EXISTS "Authenticated users can update purchase orders" ON storage.objects;
END $$;

CREATE POLICY "Authenticated users can upload purchase orders"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'purchase-orders');

CREATE POLICY "Anyone can view purchase orders"
ON storage.objects FOR SELECT
TO authenticated, anon
USING (bucket_id = 'purchase-orders');

CREATE POLICY "Authenticated users can update purchase orders"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'purchase-orders');

-- Function to calculate proposal parts and labor totals
CREATE OR REPLACE FUNCTION calculate_proposal_totals(p_proposal_id uuid)
RETURNS void AS $$
DECLARE
  v_parts_total numeric(10,2);
  v_labor_total numeric(10,2);
  v_deposit_amount numeric(10,2);
  v_deposit_type text;
  v_deposit_percent numeric;
BEGIN
  -- Calculate parts total (items where item_type = 'product' or NULL)
  SELECT COALESCE(SUM(line_total), 0)
  INTO v_parts_total
  FROM proposal_line_items
  WHERE proposal_id = p_proposal_id
    AND (item_type IS NULL OR item_type = 'product');

  -- Calculate labor total (items where item_type = 'labor')
  SELECT COALESCE(SUM(labor_total), 0)
  INTO v_labor_total
  FROM proposal_line_items
  WHERE proposal_id = p_proposal_id
    AND labor_total IS NOT NULL;

  -- Get deposit settings
  SELECT 
    COALESCE(ps.deposit_type, 'percentage'),
    COALESCE(ps.deposit_percent, 50)
  INTO v_deposit_type, v_deposit_percent
  FROM proposal_settings ps
  WHERE ps.proposal_id = p_proposal_id;

  -- Calculate deposit amount based on type
  IF v_deposit_type = 'percentage' THEN
    SELECT total * (v_deposit_percent / 100)
    INTO v_deposit_amount
    FROM proposals
    WHERE id = p_proposal_id;
  ELSIF v_deposit_type = 'parts_total' THEN
    v_deposit_amount := v_parts_total;
  ELSE
    v_deposit_amount := 0;
  END IF;

  -- Update proposal
  UPDATE proposals
  SET 
    parts_total = v_parts_total,
    labor_total = v_labor_total,
    deposit_amount_due = v_deposit_amount,
    updated_at = now()
  WHERE id = p_proposal_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to recalculate totals when line items change
CREATE OR REPLACE FUNCTION trigger_recalculate_proposal_totals()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM calculate_proposal_totals(OLD.proposal_id);
    RETURN OLD;
  ELSE
    PERFORM calculate_proposal_totals(NEW.proposal_id);
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS recalculate_proposal_totals_trigger ON proposal_line_items;
CREATE TRIGGER recalculate_proposal_totals_trigger
  AFTER INSERT OR UPDATE OR DELETE ON proposal_line_items
  FOR EACH ROW
  EXECUTE FUNCTION trigger_recalculate_proposal_totals();

-- Add index for deposit invoice lookup
CREATE INDEX IF NOT EXISTS idx_proposals_deposit_invoice_id ON proposals(deposit_invoice_id);
