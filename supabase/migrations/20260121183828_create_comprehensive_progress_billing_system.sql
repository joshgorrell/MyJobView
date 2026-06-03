/*
  # Create Comprehensive Progress Billing System

  1. Invoice Enhancements
    - Add `invoice_title` (text) - Custom title like "July Progress" or "Final Balance"
    - Add `source_type` (text) - Type of invoice: deposit, progress, final, change_order, manual
    - Add `sales_order_id` (uuid) - Link to parent sales order
    - Add `billed_from_proposal` (boolean) - Track if items from original proposal
    - Add `includes_change_orders` (boolean) - Flag if change order items included

  2. New Tables
    - `invoice_change_order_links` - Links invoices to change orders with billing tracking
    - `invoice_line_item_sources` - Track source of each line item (proposal vs change order)

  3. Change Order Updates
    - Add `amount_billed` - Track how much has been invoiced
    - Add `billing_status` - unbilled, partially_billed, fully_billed

  4. Functions
    - `validate_invoice_amount` - Ensure invoices don't exceed contract total
    - `get_billing_summary` - Get complete billing status for a sales order

  5. Security
    - RLS policies for new tables
    - Proper indexes for performance
*/

-- Add new fields to invoices table
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'invoice_title') THEN
    ALTER TABLE invoices ADD COLUMN invoice_title text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'source_type') THEN
    ALTER TABLE invoices ADD COLUMN source_type text DEFAULT 'manual' CHECK (source_type IN ('deposit', 'progress', 'final', 'change_order', 'manual'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'sales_order_id') THEN
    ALTER TABLE invoices ADD COLUMN sales_order_id uuid REFERENCES sales_orders(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'billed_from_proposal') THEN
    ALTER TABLE invoices ADD COLUMN billed_from_proposal boolean DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'includes_change_orders') THEN
    ALTER TABLE invoices ADD COLUMN includes_change_orders boolean DEFAULT false;
  END IF;
END $$;

-- Create index on sales_order_id
CREATE INDEX IF NOT EXISTS idx_invoices_sales_order ON invoices(sales_order_id);

-- Create invoice_change_order_links table
CREATE TABLE IF NOT EXISTS invoice_change_order_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  change_order_id uuid NOT NULL REFERENCES change_orders(id) ON DELETE CASCADE,
  amount_billed numeric(10,2) NOT NULL DEFAULT 0,
  fully_billed boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(invoice_id, change_order_id)
);

CREATE INDEX IF NOT EXISTS idx_invoice_co_links_invoice ON invoice_change_order_links(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_co_links_change_order ON invoice_change_order_links(change_order_id);

-- Enable RLS
ALTER TABLE invoice_change_order_links ENABLE ROW LEVEL SECURITY;

-- RLS Policies for invoice_change_order_links
CREATE POLICY "Staff can view invoice change order links in their company"
  ON invoice_change_order_links FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Staff can create invoice change order links in their company"
  ON invoice_change_order_links FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Staff can update invoice change order links in their company"
  ON invoice_change_order_links FOR UPDATE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Staff can delete invoice change order links in their company"
  ON invoice_change_order_links FOR DELETE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Create invoice_line_item_sources table
CREATE TABLE IF NOT EXISTS invoice_line_item_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_line_item_id uuid NOT NULL REFERENCES invoice_line_items(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('proposal_line_item', 'change_order_line_item', 'manual')),
  source_id uuid,
  amount_billed numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_line_sources_line_item ON invoice_line_item_sources(invoice_line_item_id);
CREATE INDEX IF NOT EXISTS idx_invoice_line_sources_source ON invoice_line_item_sources(source_id);

-- Enable RLS
ALTER TABLE invoice_line_item_sources ENABLE ROW LEVEL SECURITY;

-- RLS Policies for invoice_line_item_sources
CREATE POLICY "Staff can view invoice line item sources in their company"
  ON invoice_line_item_sources FOR SELECT
  TO authenticated
  USING (
    invoice_line_item_id IN (
      SELECT ili.id FROM invoice_line_items ili
      JOIN invoices i ON ili.invoice_id = i.id
      WHERE i.company_id IN (
        SELECT company_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Staff can create invoice line item sources in their company"
  ON invoice_line_item_sources FOR INSERT
  TO authenticated
  WITH CHECK (
    invoice_line_item_id IN (
      SELECT ili.id FROM invoice_line_items ili
      JOIN invoices i ON ili.invoice_id = i.id
      WHERE i.company_id IN (
        SELECT company_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Staff can update invoice line item sources in their company"
  ON invoice_line_item_sources FOR UPDATE
  TO authenticated
  USING (
    invoice_line_item_id IN (
      SELECT ili.id FROM invoice_line_items ili
      JOIN invoices i ON ili.invoice_id = i.id
      WHERE i.company_id IN (
        SELECT company_id FROM profiles WHERE id = auth.uid()
      )
    )
  )
  WITH CHECK (
    invoice_line_item_id IN (
      SELECT ili.id FROM invoice_line_items ili
      JOIN invoices i ON ili.invoice_id = i.id
      WHERE i.company_id IN (
        SELECT company_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Staff can delete invoice line item sources in their company"
  ON invoice_line_item_sources FOR DELETE
  TO authenticated
  USING (
    invoice_line_item_id IN (
      SELECT ili.id FROM invoice_line_items ili
      JOIN invoices i ON ili.invoice_id = i.id
      WHERE i.company_id IN (
        SELECT company_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

-- Add billing fields to change_orders table
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'change_orders' AND column_name = 'amount_billed') THEN
    ALTER TABLE change_orders ADD COLUMN amount_billed numeric(10,2) DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'change_orders' AND column_name = 'billing_status') THEN
    ALTER TABLE change_orders ADD COLUMN billing_status text DEFAULT 'unbilled' CHECK (billing_status IN ('unbilled', 'partially_billed', 'fully_billed'));
  END IF;
END $$;

-- Function to validate invoice amount doesn't exceed contract total
CREATE OR REPLACE FUNCTION validate_invoice_amount(
  p_sales_order_id uuid,
  p_new_invoice_amount numeric,
  p_exclude_invoice_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb;
  v_contract_total numeric := 0;
  v_billed_total numeric := 0;
  v_remaining_balance numeric := 0;
  v_proposal_total numeric := 0;
  v_change_orders_total numeric := 0;
BEGIN
  -- Get proposal total from sales order
  SELECT COALESCE(p.total, 0)
  INTO v_proposal_total
  FROM sales_orders so
  LEFT JOIN proposals p ON so.proposal_id = p.id
  WHERE so.id = p_sales_order_id;

  -- Get approved change orders total
  SELECT COALESCE(SUM(new_contract_total - original_contract_amount), 0)
  INTO v_change_orders_total
  FROM change_orders
  WHERE sales_order_id = p_sales_order_id
    AND approval_status = 'approved';

  -- Calculate total contract value
  v_contract_total := v_proposal_total + v_change_orders_total;

  -- Get total already billed (excluding the invoice being validated if editing)
  SELECT COALESCE(SUM(total), 0)
  INTO v_billed_total
  FROM invoices
  WHERE sales_order_id = p_sales_order_id
    AND status != 'void'
    AND (p_exclude_invoice_id IS NULL OR id != p_exclude_invoice_id);

  -- Calculate remaining balance
  v_remaining_balance := v_contract_total - v_billed_total;

  -- Build result object
  v_result := jsonb_build_object(
    'valid', v_remaining_balance >= p_new_invoice_amount,
    'contract_total', v_contract_total,
    'proposal_total', v_proposal_total,
    'change_orders_total', v_change_orders_total,
    'billed_total', v_billed_total,
    'remaining_balance', v_remaining_balance,
    'requested_amount', p_new_invoice_amount,
    'would_exceed_by', CASE 
      WHEN p_new_invoice_amount > v_remaining_balance 
      THEN p_new_invoice_amount - v_remaining_balance 
      ELSE 0 
    END
  );

  RETURN v_result;
END;
$$;

-- Function to get complete billing summary for a sales order
CREATE OR REPLACE FUNCTION get_billing_summary(p_sales_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_summary jsonb;
  v_proposal_total numeric := 0;
  v_change_orders jsonb;
  v_invoices jsonb;
  v_billed_total numeric := 0;
BEGIN
  -- Get proposal total
  SELECT COALESCE(p.total, 0)
  INTO v_proposal_total
  FROM sales_orders so
  LEFT JOIN proposals p ON so.proposal_id = p.id
  WHERE so.id = p_sales_order_id;

  -- Get change orders summary
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', co.id,
        'change_order_number', co.change_order_number,
        'description', co.description,
        'change_amount', co.change_amount,
        'tax_amount', co.tax_amount,
        'total_impact', co.new_contract_total - co.original_contract_amount,
        'amount_billed', COALESCE(co.amount_billed, 0),
        'billing_status', co.billing_status,
        'approval_status', co.approval_status,
        'approved_at', co.approved_at
      )
      ORDER BY co.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_change_orders
  FROM change_orders co
  WHERE co.sales_order_id = p_sales_order_id;

  -- Get invoices summary
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', i.id,
        'invoice_number', i.invoice_number,
        'invoice_title', i.invoice_title,
        'source_type', i.source_type,
        'invoice_date', i.invoice_date,
        'due_date', i.due_date,
        'total', i.total,
        'amount_paid', i.amount_paid,
        'amount_due', i.amount_due,
        'status', i.status,
        'billed_from_proposal', i.billed_from_proposal,
        'includes_change_orders', i.includes_change_orders
      )
      ORDER BY i.invoice_date DESC
    ),
    '[]'::jsonb
  )
  INTO v_invoices
  FROM invoices i
  WHERE i.sales_order_id = p_sales_order_id
    AND i.status != 'void';

  -- Calculate total billed
  SELECT COALESCE(SUM(total), 0)
  INTO v_billed_total
  FROM invoices
  WHERE sales_order_id = p_sales_order_id
    AND status != 'void';

  -- Build summary
  v_summary := jsonb_build_object(
    'sales_order_id', p_sales_order_id,
    'proposal_total', v_proposal_total,
    'change_orders', v_change_orders,
    'change_orders_total', (
      SELECT COALESCE(SUM((co->>'total_impact')::numeric), 0)
      FROM jsonb_array_elements(v_change_orders) co
      WHERE co->>'approval_status' = 'approved'
    ),
    'contract_total', v_proposal_total + (
      SELECT COALESCE(SUM((co->>'total_impact')::numeric), 0)
      FROM jsonb_array_elements(v_change_orders) co
      WHERE co->>'approval_status' = 'approved'
    ),
    'invoices', v_invoices,
    'billed_total', v_billed_total,
    'remaining_balance', v_proposal_total + (
      SELECT COALESCE(SUM((co->>'total_impact')::numeric), 0)
      FROM jsonb_array_elements(v_change_orders) co
      WHERE co->>'approval_status' = 'approved'
    ) - v_billed_total,
    'billing_progress_percent', CASE 
      WHEN v_proposal_total + (
        SELECT COALESCE(SUM((co->>'total_impact')::numeric), 0)
        FROM jsonb_array_elements(v_change_orders) co
        WHERE co->>'approval_status' = 'approved'
      ) > 0 
      THEN (v_billed_total / (v_proposal_total + (
        SELECT COALESCE(SUM((co->>'total_impact')::numeric), 0)
        FROM jsonb_array_elements(v_change_orders) co
        WHERE co->>'approval_status' = 'approved'
      )) * 100)
      ELSE 0
    END
  );

  RETURN v_summary;
END;
$$;

-- Trigger to update change order billing status when invoices are created/updated
CREATE OR REPLACE FUNCTION update_change_order_billing_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_change_order record;
  v_total_billed numeric;
  v_change_order_total numeric;
BEGIN
  -- Loop through all change orders linked to this invoice
  FOR v_change_order IN
    SELECT DISTINCT co.id, co.new_contract_total - co.original_contract_amount as total_impact
    FROM change_orders co
    JOIN invoice_change_order_links icol ON co.id = icol.change_order_id
    WHERE icol.invoice_id = NEW.id
  LOOP
    -- Calculate total billed for this change order
    SELECT COALESCE(SUM(amount_billed), 0)
    INTO v_total_billed
    FROM invoice_change_order_links
    WHERE change_order_id = v_change_order.id;

    v_change_order_total := v_change_order.total_impact;

    -- Update change order billing status
    UPDATE change_orders
    SET 
      amount_billed = v_total_billed,
      billing_status = CASE
        WHEN v_total_billed = 0 THEN 'unbilled'
        WHEN v_total_billed >= v_change_order_total THEN 'fully_billed'
        ELSE 'partially_billed'
      END
    WHERE id = v_change_order.id;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_change_order_billing
  AFTER INSERT OR UPDATE ON invoice_change_order_links
  FOR EACH ROW
  EXECUTE FUNCTION update_change_order_billing_status();
