/*
  # Add Bill-To Contact to Proposals

  ## Summary
  Adds the ability to set a separate billing party (contractor, property manager, etc.)
  on a proposal that is distinct from the primary customer/job site owner.

  ## New Columns on `proposals`
  - `bill_to_contact_id` (uuid, nullable, FK → contacts) — the party who will be billed;
    when NULL the primary customer (`contact_id`) is the billing party
  - `bill_to_send_to` (text, default 'customer') — controls who receives portal invite
    and email communications:
      'customer'  → send only to the primary customer
      'bill_to'   → send only to the bill-to contact
      'both'      → send to both parties

  ## Changes to `invoices`
  - `bill_to_contact_id` (uuid, nullable, FK → contacts) — tracks which contact was
    chosen as the billing party on this invoice (separate from the snapshot fields)
    so the swap arrow can restore either party easily

  ## Security
  - No new RLS required; bill_to_contact_id columns follow the same policies as the
    parent tables (proposals and invoices already have RLS enabled)

  ## Notes
  - Fully backward-compatible — existing proposals and invoices with NULL bill_to_contact_id
    behave exactly as before
*/

-- Add bill-to fields to proposals
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposals' AND column_name = 'bill_to_contact_id'
  ) THEN
    ALTER TABLE proposals ADD COLUMN bill_to_contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposals' AND column_name = 'bill_to_send_to'
  ) THEN
    ALTER TABLE proposals ADD COLUMN bill_to_send_to text NOT NULL DEFAULT 'customer'
      CHECK (bill_to_send_to IN ('customer', 'bill_to', 'both'));
  END IF;
END $$;

-- Add bill-to tracking to invoices so swap arrow knows both parties
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'bill_to_contact_id'
  ) THEN
    ALTER TABLE invoices ADD COLUMN bill_to_contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Index for efficient lookups by billing party
CREATE INDEX IF NOT EXISTS idx_proposals_bill_to_contact_id ON proposals(bill_to_contact_id);
CREATE INDEX IF NOT EXISTS idx_invoices_bill_to_contact_id ON invoices(bill_to_contact_id);
