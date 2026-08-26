/*
# Add customer_contact_id to product_requests

## Purpose
Allows tagging a parts request with a specific customer (contact) for billing purposes,
especially in General/Stock mode where items are ordered in advance but will be
billed to a customer later.

## Changes
- Adds `customer_contact_id` (uuid, nullable) to `product_requests`
- FK to `contacts` with ON DELETE SET NULL
- No backfill needed (existing rows can infer customer from linked SO/WO/project/SR)

## Security
- No RLS policy changes needed — the column is covered by existing policies
*/
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_requests' AND column_name = 'customer_contact_id'
  ) THEN
    ALTER TABLE product_requests ADD COLUMN customer_contact_id uuid;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'product_requests_customer_contact_id_fkey'
  ) THEN
    ALTER TABLE product_requests
      ADD CONSTRAINT product_requests_customer_contact_id_fkey
      FOREIGN KEY (customer_contact_id) REFERENCES contacts(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_product_requests_customer_contact_id
  ON product_requests(customer_contact_id) WHERE customer_contact_id IS NOT NULL;
