/*
# Add Bill To / Ship To / Internal & External Notes to Purchase Orders

1. company_offices table
   - Add `is_headquarters` boolean (default false) so one office can be marked as the
     default Bill To location for all purchase orders.

2. purchase_orders table
   - Add `bill_to_office_id` (uuid, references company_offices) — which office is billing.
   - Add `ship_to_office_id` (uuid, references company_offices, nullable) — which office
     to ship to when shipping to an office.
   - Add `ship_to_contact_id` (uuid, references contacts, nullable) — which customer to
     ship to when shipping directly to a customer.
   - Add denormalized address snapshot columns so the PO record stays accurate even if
     the source office or contact is later edited:
       bill_to_name, bill_to_address, bill_to_city, bill_to_state, bill_to_zip
       ship_to_name, ship_to_address, ship_to_city, ship_to_state, ship_to_zip
   - Add `internal_note` text — visible only to internal users looking at the PO.
   - Add `external_note` text — printed on the PO and sent to the vendor (e.g.
     "Please ship ASAP!").

3. Security
   - No new tables; existing RLS policies on purchase_orders and company_offices
     already cover the new columns (column-level privileges are not in use).
   - company_offices is already readable by all authenticated users, so the
     is_headquarters flag is visible to anyone who can create a PO.

4. Notes
   - The existing `notes` column on purchase_orders is kept for backward
     compatibility; the UI will use internal_note and external_note going forward.
   - All new columns are nullable so existing PO rows are not affected.
*/

-- 1. Add is_headquarters to company_offices
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_offices' AND column_name = 'is_headquarters'
  ) THEN
    ALTER TABLE company_offices ADD COLUMN is_headquarters boolean DEFAULT false;
  END IF;
END $$;

-- Index for quickly finding the headquarters office
CREATE INDEX IF NOT EXISTS idx_company_offices_is_headquarters
  ON company_offices(is_headquarters) WHERE is_headquarters = true;

-- 2. Add bill_to / ship_to / notes columns to purchase_orders
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_orders' AND column_name = 'bill_to_office_id'
  ) THEN
    ALTER TABLE purchase_orders ADD COLUMN bill_to_office_id uuid REFERENCES company_offices(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_orders' AND column_name = 'ship_to_office_id'
  ) THEN
    ALTER TABLE purchase_orders ADD COLUMN ship_to_office_id uuid REFERENCES company_offices(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_orders' AND column_name = 'ship_to_contact_id'
  ) THEN
    ALTER TABLE purchase_orders ADD COLUMN ship_to_contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Denormalized bill-to address snapshot
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_orders' AND column_name = 'bill_to_name'
  ) THEN
    ALTER TABLE purchase_orders ADD COLUMN bill_to_name text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_orders' AND column_name = 'bill_to_address'
  ) THEN
    ALTER TABLE purchase_orders ADD COLUMN bill_to_address text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_orders' AND column_name = 'bill_to_city'
  ) THEN
    ALTER TABLE purchase_orders ADD COLUMN bill_to_city text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_orders' AND column_name = 'bill_to_state'
  ) THEN
    ALTER TABLE purchase_orders ADD COLUMN bill_to_state text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_orders' AND column_name = 'bill_to_zip'
  ) THEN
    ALTER TABLE purchase_orders ADD COLUMN bill_to_zip text;
  END IF;
END $$;

-- Denormalized ship-to address snapshot
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_orders' AND column_name = 'ship_to_name'
  ) THEN
    ALTER TABLE purchase_orders ADD COLUMN ship_to_name text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_orders' AND column_name = 'ship_to_address'
  ) THEN
    ALTER TABLE purchase_orders ADD COLUMN ship_to_address text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_orders' AND column_name = 'ship_to_city'
  ) THEN
    ALTER TABLE purchase_orders ADD COLUMN ship_to_city text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_orders' AND column_name = 'ship_to_state'
  ) THEN
    ALTER TABLE purchase_orders ADD COLUMN ship_to_state text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_orders' AND column_name = 'ship_to_zip'
  ) THEN
    ALTER TABLE purchase_orders ADD COLUMN ship_to_zip text;
  END IF;
END $$;

-- Internal and external notes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_orders' AND column_name = 'internal_note'
  ) THEN
    ALTER TABLE purchase_orders ADD COLUMN internal_note text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_orders' AND column_name = 'external_note'
  ) THEN
    ALTER TABLE purchase_orders ADD COLUMN external_note text;
  END IF;
END $$;

-- Indexes for the new foreign keys
CREATE INDEX IF NOT EXISTS idx_purchase_orders_bill_to_office
  ON purchase_orders(bill_to_office_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_ship_to_office
  ON purchase_orders(ship_to_office_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_ship_to_contact
  ON purchase_orders(ship_to_contact_id);
