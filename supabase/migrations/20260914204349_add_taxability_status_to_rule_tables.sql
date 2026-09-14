/*
# Add taxability_status to master_state_tax_rules and state_tax_rules_matrix

## Purpose
Replaces the boolean `is_taxable` column on both tax rule tables with a
three-valued `taxability_status` text column that can express:
  - 'taxable'      — state law says this amount is taxable
  - 'non_taxable'  — state law says this amount is not taxable
  - 'needs_review' — no rule matched, requires manual review

This eliminates the dangerous default-to-taxable behavior where a missing
rule silently resulted in tax being applied.

## Changes to master_state_tax_rules
1. Add `taxability_status text NOT NULL DEFAULT 'taxable'`
2. Add CHECK constraint: taxability_status IN ('taxable','non_taxable','needs_review')
3. Migrate existing data: is_taxable=true -> 'taxable', is_taxable=false -> 'non_taxable'
4. Drop `is_taxable` column (no code reads this table currently)

## Changes to state_tax_rules_matrix
1. Add `taxability_status text NOT NULL DEFAULT 'taxable'`
2. Add CHECK constraint: taxability_status IN ('taxable','non_taxable','needs_review')
3. Migrate existing data: is_taxable=true -> 'taxable', is_taxable=false -> 'non_taxable'
4. Drop `is_taxable` column

## Security
No RLS changes — both tables already have RLS enabled.
No new policies needed.

## Notes
- The `is_taxable` column is dropped because no application code or database
  function currently reads from either table. The migration is safe.
- The default 'taxable' is set so the NOT NULL constraint is satisfied during
  column addition; data migration immediately updates all rows to their
  correct status based on the former is_taxable value.
*/

-- ── master_state_tax_rules ──────────────────────────────────────────────
ALTER TABLE master_state_tax_rules
  ADD COLUMN IF NOT EXISTS taxability_status text NOT NULL DEFAULT 'taxable';

-- Migrate existing data
UPDATE master_state_tax_rules
  SET taxability_status = CASE WHEN is_taxable THEN 'taxable' ELSE 'non_taxable' END;

-- Add CHECK constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'master_state_tax_rules_taxability_status_check'
  ) THEN
    ALTER TABLE master_state_tax_rules
      ADD CONSTRAINT master_state_tax_rules_taxability_status_check
      CHECK (taxability_status IN ('taxable', 'non_taxable', 'needs_review'));
  END IF;
END $$;

-- Drop the old is_taxable column
ALTER TABLE master_state_tax_rules
  DROP COLUMN IF EXISTS is_taxable;

-- ── state_tax_rules_matrix ──────────────────────────────────────────────
ALTER TABLE state_tax_rules_matrix
  ADD COLUMN IF NOT EXISTS taxability_status text NOT NULL DEFAULT 'taxable';

-- Migrate existing data
UPDATE state_tax_rules_matrix
  SET taxability_status = CASE WHEN is_taxable THEN 'taxable' ELSE 'non_taxable' END;

-- Add CHECK constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'state_tax_rules_matrix_taxability_status_check'
  ) THEN
    ALTER TABLE state_tax_rules_matrix
      ADD CONSTRAINT state_tax_rules_matrix_taxability_status_check
      CHECK (taxability_status IN ('taxable', 'non_taxable', 'needs_review'));
  END IF;
END $$;

-- Drop the old is_taxable column
ALTER TABLE state_tax_rules_matrix
  DROP COLUMN IF EXISTS is_taxable;
