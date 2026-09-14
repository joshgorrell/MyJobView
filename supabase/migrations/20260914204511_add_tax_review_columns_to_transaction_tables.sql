/*
# Add tax_review_required and tax_calculation_status to transaction tables

## Purpose
Adds two columns to proposals, change_orders, and invoices so the system
can record the outcome of the tax calculation orchestrator and block
finalization when review is required.

## New Columns (on each of: proposals, change_orders, invoices)
1. `tax_review_required` (boolean, NOT NULL, DEFAULT false)
   - Set to true by the orchestrator when any layer (taxability, origin,
     nexus, destination) requires review.
   - When true, blocks finalization of the transaction.

2. `tax_calculation_status` (text, nullable)
   - Stores the orchestrator's final status: 'ready', 'review_required',
     'not_collecting', 'exempt'.
   - CHECK constraint: tax_calculation_status IN
     ('ready', 'review_required', 'not_collecting', 'exempt')

## Security
No RLS changes. All three tables already have RLS enabled.

## Notes
- These columns record the outcome of a calculation, not the rule itself.
- tax_review_required is a convenience flag for quick filtering in queries.
- tax_calculation_status provides the detailed reason.
- The CHECK constraint follows the project's existing convention of
  CHECK-constrained text columns (same pattern as dealer_nexus_states.nexus_status).
*/

-- ── proposals ──────────────────────────────────────────────────────────
ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS tax_review_required boolean NOT NULL DEFAULT false;

ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS tax_calculation_status text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'proposals_tax_calculation_status_check'
  ) THEN
    ALTER TABLE proposals
      ADD CONSTRAINT proposals_tax_calculation_status_check
      CHECK (tax_calculation_status IN ('ready', 'review_required', 'not_collecting', 'exempt'));
  END IF;
END $$;

-- ── change_orders ───────────────────────────────────────────────────────
ALTER TABLE change_orders
  ADD COLUMN IF NOT EXISTS tax_review_required boolean NOT NULL DEFAULT false;

ALTER TABLE change_orders
  ADD COLUMN IF NOT EXISTS tax_calculation_status text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'change_orders_tax_calculation_status_check'
  ) THEN
    ALTER TABLE change_orders
      ADD CONSTRAINT change_orders_tax_calculation_status_check
      CHECK (tax_calculation_status IN ('ready', 'review_required', 'not_collecting', 'exempt'));
  END IF;
END $$;

-- ── invoices ───────────────────────────────────────────────────────────
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS tax_review_required boolean NOT NULL DEFAULT false;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS tax_calculation_status text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_tax_calculation_status_check'
  ) THEN
    ALTER TABLE invoices
      ADD CONSTRAINT invoices_tax_calculation_status_check
      CHECK (tax_calculation_status IN ('ready', 'review_required', 'not_collecting', 'exempt'));
  END IF;
END $$;
