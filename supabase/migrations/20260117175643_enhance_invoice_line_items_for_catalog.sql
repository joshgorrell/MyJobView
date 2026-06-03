/*
  # Enhance Invoice Line Items for Product Catalog Integration

  1. Changes to invoice_line_items table
    - Add `product_id` (uuid, nullable) - link to products table
    - Add `sku` (text, nullable) - snapshot of SKU at time of invoice
    - Add `is_taxable` (boolean, default true) - per-line tax override
    - Add `source_type` (text) - tracks origin: 'catalog', 'package', 'work_order', 'manual'
    - Add `notes` (text, nullable) - per-line notes field
    - Add `cost` (numeric, nullable) - snapshot of cost for margin tracking

  2. Indexes
    - Add index on product_id for relationship queries
    - Add index on invoice_id (already exists but verify)

  3. Security
    - Existing RLS policies cover new columns
*/

-- Add new columns to invoice_line_items
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoice_line_items' AND column_name = 'product_id') THEN
    ALTER TABLE invoice_line_items ADD COLUMN product_id uuid REFERENCES products(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoice_line_items' AND column_name = 'sku') THEN
    ALTER TABLE invoice_line_items ADD COLUMN sku text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoice_line_items' AND column_name = 'is_taxable') THEN
    ALTER TABLE invoice_line_items ADD COLUMN is_taxable boolean DEFAULT true;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoice_line_items' AND column_name = 'source_type') THEN
    ALTER TABLE invoice_line_items ADD COLUMN source_type text DEFAULT 'manual' CHECK (source_type IN ('catalog', 'package', 'work_order', 'manual'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoice_line_items' AND column_name = 'notes') THEN
    ALTER TABLE invoice_line_items ADD COLUMN notes text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoice_line_items' AND column_name = 'cost') THEN
    ALTER TABLE invoice_line_items ADD COLUMN cost numeric(10,2);
  END IF;
END $$;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_invoice_line_items_product_id ON invoice_line_items(product_id);
CREATE INDEX IF NOT EXISTS idx_invoice_line_items_invoice_id ON invoice_line_items(invoice_id);

-- Function to get recently used products in invoices
CREATE OR REPLACE FUNCTION get_recently_used_products(p_company_id uuid, p_limit integer DEFAULT 10)
RETURNS TABLE (
  product_id uuid,
  usage_count bigint,
  last_used timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ili.product_id,
    COUNT(*) as usage_count,
    MAX(i.created_at) as last_used
  FROM invoice_line_items ili
  JOIN invoices i ON ili.invoice_id = i.id
  WHERE ili.product_id IS NOT NULL
    AND i.company_id = p_company_id
    AND i.created_at >= NOW() - INTERVAL '90 days'
  GROUP BY ili.product_id
  ORDER BY MAX(i.created_at) DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
