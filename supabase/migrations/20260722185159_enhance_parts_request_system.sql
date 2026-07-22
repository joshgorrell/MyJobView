/*
# Enhance Parts Request System

## Purpose
Extend the product_requests and product_request_items tables to support:
- Requests originating from sales orders and service requests (not just work orders/projects)
- Office association for each request
- Per-item linkage to purchase orders (so we can track which items were ordered and on which PO)
- Per-item ordering status (ordered_quantity, ordered_status)
- A proper po_items table (referenced by code but missing from DB)

## Changes to product_requests
- Add `sales_order_id` (uuid, nullable FK to sales_orders) -- links request to a sales order
- Add `service_request_id` (uuid, nullable FK to service_requests) -- links request to a service request
- Add `office_id` (uuid, nullable FK to company_offices) -- which office this request is for

## Changes to product_request_items
- Add `purchase_order_id` (uuid, nullable FK to purchase_orders) -- links item to the PO it was ordered on
- Add `ordered_quantity` (integer, nullable) -- how many were actually ordered
- Add `ordered_status` (text, nullable) -- per-item status: null=pending, 'ordered', 'received'

## New Table: po_items
- `id` (uuid PK)
- `po_id` (uuid FK to purchase_orders, NOT NULL)
- `product_id` (uuid, nullable FK to products)
- `product_name` (text, NOT NULL)
- `model_number` (text, nullable)
- `vendor` (text, nullable)
- `quantity` (integer, NOT NULL)
- `unit_price` (numeric, nullable)
- `total_price` (numeric, nullable)
- `product_request_item_id` (uuid, nullable FK to product_request_items) -- back-reference to the request item that generated this PO line
- `created_at` (timestamptz, default now())
- `organization_id` (uuid, NOT NULL, default get_user_org_id())

## Security
- RLS enabled on po_items (was missing entirely)
- RLS policies for po_items: SELECT/INSERT/UPDATE/DELETE for authenticated users scoped by organization_id
- No changes to existing RLS on product_requests or product_request_items (new columns are covered by existing org-scoped policies)

## Indexes
- product_requests(sales_order_id)
- product_requests(service_request_id)
- product_requests(office_id)
- product_request_items(purchase_order_id)
- po_items(po_id)
- po_items(product_request_item_id)
*/

-- Add columns to product_requests
DO $$ BEGIN
  ALTER TABLE product_requests ADD COLUMN sales_order_id uuid REFERENCES sales_orders(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE product_requests ADD COLUMN service_request_id uuid REFERENCES service_requests(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE product_requests ADD COLUMN office_id uuid REFERENCES company_offices(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Add columns to product_request_items
DO $$ BEGIN
  ALTER TABLE product_request_items ADD COLUMN purchase_order_id uuid REFERENCES purchase_orders(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE product_request_items ADD COLUMN ordered_quantity integer;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE product_request_items ADD COLUMN ordered_status text;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Create po_items table
CREATE TABLE IF NOT EXISTS po_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  model_number text,
  vendor text,
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric,
  total_price numeric,
  product_request_item_id uuid REFERENCES product_request_items(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  organization_id uuid NOT NULL DEFAULT get_user_org_id()
);

-- Enable RLS on po_items
ALTER TABLE po_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for po_items
DROP POLICY IF EXISTS "select_po_items" ON po_items;
CREATE POLICY "select_po_items" ON po_items FOR SELECT
  TO authenticated USING (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "insert_po_items" ON po_items;
CREATE POLICY "insert_po_items" ON po_items FOR INSERT
  TO authenticated WITH CHECK (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "update_po_items" ON po_items;
CREATE POLICY "update_po_items" ON po_items FOR UPDATE
  TO authenticated USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "delete_po_items" ON po_items;
CREATE POLICY "delete_po_items" ON po_items FOR DELETE
  TO authenticated USING (organization_id = get_user_org_id());

-- Indexes
CREATE INDEX IF NOT EXISTS idx_product_requests_sales_order_id ON product_requests(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_product_requests_service_request_id ON product_requests(service_request_id);
CREATE INDEX IF NOT EXISTS idx_product_requests_office_id ON product_requests(office_id);
CREATE INDEX IF NOT EXISTS idx_product_request_items_purchase_order_id ON product_request_items(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_po_items_po_id ON po_items(po_id);
CREATE INDEX IF NOT EXISTS idx_po_items_product_request_item_id ON po_items(product_request_item_id);
