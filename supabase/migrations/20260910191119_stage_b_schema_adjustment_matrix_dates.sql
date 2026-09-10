/*
# Stage B Schema Adjustment: Distinguish Matrix Version Date from Statutory Effective Date

## Purpose
The existing `effective_from` column on `state_tax_rules_matrix` conflates three distinct concepts:
  1. When a rule was imported/migrated into the MJV matrix (migration baseline date)
  2. When a matrix version becomes active for MJV calculations (matrix version effective date)
  3. When the underlying statute or regulation legally took effect (statutory effective date)

This migration adds two new columns to separate these concepts and renames the semantic
meaning of `effective_from` to represent the **matrix version effective date** — the date
this rule becomes active within the MJV matrix system.

## New Columns

### state_tax_rules_matrix.migrated_at
- `migrated_at` (timestamptz, NOT NULL, DEFAULT now())
- Records when this rule was imported/migrated into the MJV matrix
- For the initial Kansas/Missouri baseline migration, this will be set to the migration
  execution timestamp
- For future rule changes, this records when the new rule row was inserted

### state_tax_rules_matrix.statutory_effective_date
- `statutory_effective_date` (date, nullable)
- Records the legal/statutory effective date of the underlying tax rule, where known
- For the initial Kansas/Missouri baseline migration, this is set to NULL because:
  - The existing KS_RULES and MO_RULES do not carry statutory effective dates
  - We are migrating existing approved rules, not creating new legal interpretations
  - Guessing historical statutory effective dates is explicitly prohibited
- Future rule changes may populate this when the statutory date is known from legislation

## Existing Column: effective_from
- Remains `effective_from` (date, NOT NULL, DEFAULT CURRENT_DATE)
- Semantic meaning is now: **matrix version effective date** — the date this rule
  becomes active within the MJV matrix for calculation purposes
- For the initial baseline migration, this is set to '2026-09-10' (the migration date),
  documenting that this represents the initial MJV matrix baseline, NOT a claim about
  when the Kansas statute took effect
- This is explicitly NOT the statutory effective date of the Kansas tax law

## Important Notes
1. No data exists in the table yet (verified: 0 rows), so no backfill is needed
2. The `migrated_at` default of `now()` will be set automatically on all INSERT operations
3. `statutory_effective_date` is nullable and starts NULL for all baseline rules
4. This schema adjustment is a prerequisite for B1 (Kansas) and B2 (Missouri) migrations
5. No production calculations are changed
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'state_tax_rules_matrix' AND column_name = 'migrated_at'
  ) THEN
    ALTER TABLE state_tax_rules_matrix ADD COLUMN migrated_at timestamptz NOT NULL DEFAULT now();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'state_tax_rules_matrix' AND column_name = 'statutory_effective_date'
  ) THEN
    ALTER TABLE state_tax_rules_matrix ADD COLUMN statutory_effective_date date;
  END IF;
END $$;
