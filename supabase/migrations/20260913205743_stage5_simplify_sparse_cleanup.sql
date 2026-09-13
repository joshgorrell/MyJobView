/*
# Stage 5 Simplification: Sparse Model Cleanup

## Purpose
Simplifies transaction_modifiers to a sparse architecture:
1. Delete 43 zero-value placeholder rows, keeping only 5 configured/enabled rows
2. Remove all inheritance infrastructure (unused, copy-based model replaces it)
3. Update _stage5_rollback_ids to reflect the 5 surviving rows

## Changes

### Data Deletions (43 rows)
- Deletes all rows where is_enabled = false AND percentage_value = 0
  AND calculated_amount = 0 AND custom_label IS NULL AND classification_id IS NULL
- Preserves 5 enabled rows with real configuration

### Inheritance Infrastructure Removal
- Drop trigger: tm_validate_inheritance
- Drop function: validate_tm_inheritance()
- Drop FK: tm_inherited_from_fkey (self-referencing RESTRICT)
- Drop index: tm_inherited_from_idx
- Drop CHECK constraints: tm_inherited_only_for_co, tm_inherited_requires_link
- Drop columns: is_inherited, inherited_from_modifier_id

### Rollback Tracking Update
- Delete the 43 removed row IDs from _stage5_rollback_ids
- Preserves the 5 surviving row IDs

### NOT Modified
- proposals, proposal_settings, change_orders (all legacy columns intact)
- taxCalculations.ts, computeTaxTotals()
- Tax snapshots, TaxJar, QBO
- master_classifications, master_state_tax_rules
- dealer_nexus_states, dealer_modifier_defaults
- Stage 3/4 rollback tracking
- Core schema (all non-inheritance constraints, FKs, indexes, RLS, triggers retained)

## Expected Final State
- transaction_modifiers: 5 rows (all proposal-owned, all enabled)
- _stage5_rollback_ids: 5 rows
- No inheritance columns, constraints, FK, index, trigger, or function
*/

-- ============================================================
-- 1. DELETE 43 PLACEHOLDER ROWS
-- ============================================================

-- First capture the IDs to delete for rollback table cleanup
CREATE TEMP TABLE _ids_to_delete AS
SELECT id FROM transaction_modifiers
WHERE is_enabled = false
    AND percentage_value = 0
    AND calculated_amount = 0
    AND custom_label IS NULL
    AND classification_id IS NULL;

-- Delete the placeholder rows
DELETE FROM transaction_modifiers
WHERE id IN (SELECT id FROM _ids_to_delete);

-- Remove deleted IDs from rollback tracking
DELETE FROM _stage5_rollback_ids
WHERE table_name = 'transaction_modifiers'
    AND row_id IN (SELECT id FROM _ids_to_delete);

-- ============================================================
-- 2. DROP INHERITANCE TRIGGER
-- ============================================================

DROP TRIGGER IF EXISTS tm_validate_inheritance ON transaction_modifiers;

-- ============================================================
-- 3. DROP INHERITANCE FUNCTION
-- ============================================================

DROP FUNCTION IF EXISTS validate_tm_inheritance();

-- ============================================================
-- 4. DROP INHERITANCE SELF-FK
-- ============================================================

ALTER TABLE transaction_modifiers
    DROP CONSTRAINT IF EXISTS tm_inherited_from_fkey;

-- ============================================================
-- 5. DROP INHERITANCE INDEX
-- ============================================================

DROP INDEX IF EXISTS tm_inherited_from_idx;

-- ============================================================
-- 6. DROP INHERITANCE CHECK CONSTRAINTS
-- ============================================================

ALTER TABLE transaction_modifiers
    DROP CONSTRAINT IF EXISTS tm_inherited_only_for_co;

ALTER TABLE transaction_modifiers
    DROP CONSTRAINT IF EXISTS tm_inherited_requires_link;

-- ============================================================
-- 7. DROP INHERITANCE COLUMNS
-- ============================================================

ALTER TABLE transaction_modifiers
    DROP COLUMN IF EXISTS is_inherited,
    DROP COLUMN IF EXISTS inherited_from_modifier_id;