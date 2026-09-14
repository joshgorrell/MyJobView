/*
# Add missing columns to tax_snapshots

## Purpose
The tax_snapshots table already has 42 columns covering rate breakdown,
per-classification amounts, and exemption reference. This migration adds
the minimum missing columns needed to preserve the full context of a tax
calculation at lifecycle points (proposal sent/approved, change order
approved, invoice finalized).

## New Columns (additive only — no existing columns changed)
1. `tax_calculation_status` (text) — 'ready', 'review_required', 'not_collecting', 'exempt'
2. `taxability_results` (jsonb) — per-classification taxability decisions from resolve_tax_rule
3. `origin_method` (text) — 'corporate' or 'assigned_office'
4. `origin_office_id` (uuid) — the office ID actually used for sourcing
5. `origin_address` (jsonb) — the full origin address used (street, city, state, zip)
6. `destination_address` (jsonb) — the full destination address used
7. `collection_status` (text) — 'collect', 'do_not_collect', 'review_required'
8. `review_reasons` (jsonb) — array of specific reasons if review was required

## Security
No RLS changes. tax_snapshots already has RLS enabled.

## Notes
- The existing `nexus_result` column already stores the raw nexus status.
- The existing `matrix_rule_version` column already stores the rule version.
- The existing `taxable_status` column can store the overall taxability summary.
- Only 8 new columns are added — the rest of the schema is reused as-is.
- CHECK constraint on tax_calculation_status follows existing project conventions.
*/

ALTER TABLE tax_snapshots
  ADD COLUMN IF NOT EXISTS tax_calculation_status text;

ALTER TABLE tax_snapshots
  ADD COLUMN IF NOT EXISTS taxability_results jsonb;

ALTER TABLE tax_snapshots
  ADD COLUMN IF NOT EXISTS origin_method text;

ALTER TABLE tax_snapshots
  ADD COLUMN IF NOT EXISTS origin_office_id uuid;

ALTER TABLE tax_snapshots
  ADD COLUMN IF NOT EXISTS origin_address jsonb;

ALTER TABLE tax_snapshots
  ADD COLUMN IF NOT EXISTS destination_address jsonb;

ALTER TABLE tax_snapshots
  ADD COLUMN IF NOT EXISTS collection_status text;

ALTER TABLE tax_snapshots
  ADD COLUMN IF NOT EXISTS review_reasons jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tax_snapshots_tax_calculation_status_check'
  ) THEN
    ALTER TABLE tax_snapshots
      ADD CONSTRAINT tax_snapshots_tax_calculation_status_check
      CHECK (tax_calculation_status IN ('ready', 'review_required', 'not_collecting', 'exempt'));
  END IF;
END $$;
