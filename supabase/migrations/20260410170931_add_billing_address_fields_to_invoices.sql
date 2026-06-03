/*
  # Add Bill-To Address Fields to Invoices

  ## Summary
  Adds a snapshot of the customer billing address to the invoices table so that:
  1. The printed invoice shows the correct address at time of invoicing
  2. Later changes to the contact record do not retroactively alter printed invoices
  3. Staff can edit the bill-to on a per-invoice basis (e.g. alternate billing address)

  ## New Columns on `invoices`
  - `billing_name` (text, nullable) — customer/company name for the bill-to block
  - `billing_address_line1` (text, nullable) — street address line 1
  - `billing_address_line2` (text, nullable) — suite, unit, PO Box, etc.
  - `billing_city` (text, nullable) — city
  - `billing_state` (text, nullable) — state abbreviation
  - `billing_zip` (text, nullable) — postal/ZIP code

  ## Notes
  - All columns are nullable for backward compatibility with existing invoices
  - Existing invoices will fall back to the live contact address for display/print
  - No RLS changes needed — these columns inherit the existing invoices RLS policies
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'billing_name'
  ) THEN
    ALTER TABLE invoices ADD COLUMN billing_name text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'billing_address_line1'
  ) THEN
    ALTER TABLE invoices ADD COLUMN billing_address_line1 text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'billing_address_line2'
  ) THEN
    ALTER TABLE invoices ADD COLUMN billing_address_line2 text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'billing_city'
  ) THEN
    ALTER TABLE invoices ADD COLUMN billing_city text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'billing_state'
  ) THEN
    ALTER TABLE invoices ADD COLUMN billing_state text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'billing_zip'
  ) THEN
    ALTER TABLE invoices ADD COLUMN billing_zip text;
  END IF;
END $$;
