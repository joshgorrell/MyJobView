/*
# Stage 3: Migrate KS/MO Rules into master_state_tax_rules
#          + Add KS Design Fee and Freight/Delivery Rules

1. Purpose
   Migrate the 20 approved Kansas Material/Labor rules from the per-organization
   state_tax_rules_matrix into the master_state_tax_rules table as ACTIVE rules.
   These become the authoritative master rules for Kansas.

   Migrate 16 Missouri Material/Labor rules as INACTIVE/PENDING (is_active = false)
   for independent review before activation.

   Add one new Kansas Design Fee rule (separately stated, non-taxable, ACTIVE).
   Add one new Kansas Freight/Delivery rule (separately stated, non-taxable, ACTIVE).

   Do NOT add Kansas Project Management or Credit Card Fee rules.

2. Transformations
   - Classification IDs resolved by code: old per-org classification UUIDs are
     joined to master_classifications by code to get the new master UUID.
   - environment = 'both' -> qualifier_environment = NULL
   - environment = 'residential' -> qualifier_environment = 'residential'
   - environment = 'commercial' -> qualifier_environment = 'commercial'
   - project_type -> qualifier_project_type (direct copy)
   - qualifier_separately_stated = NULL for all migrated rows
   - KS migrated rules: is_active = true (preserving source)
   - MO migrated rules: is_active = false (pending review)
   - KS Design Fee: qualifier_separately_stated = true, is_active = true
   - KS Freight/Delivery: qualifier_separately_stated = true, is_active = true
   - effective_from: preserved from source (2026-09-10) for migrated rows;
     CURRENT_DATE for new Design Fee and Freight/Delivery rules

3. Rollback Strategy
   A rollback table _stage3_rollback_ids is created at the start of this
   migration. Every row inserted by this migration has its ID captured into
   that table via INSERT ... RETURNING. The rollback SQL deletes only the
   rows whose IDs appear in _stage3_rollback_ids, then drops the rollback
   table. This removes exactly and only the rows inserted by Stage 3.

4. Old table preservation
   The old state_tax_rules_matrix table is NOT modified. Old rows remain
   in place for backward compatibility and side-by-side verification.

5. No production impact
   No engine or application code references master_state_tax_rules yet.
   No production tax calculations are changed.
*/

-- ============================================================
-- PART 0: Create deterministic rollback tracking table
-- ============================================================

CREATE TABLE IF NOT EXISTS _stage3_rollback_ids (
    id uuid PRIMARY KEY
);

-- ============================================================
-- PART A: Migrate 20 Kansas Material/Labor rules (ACTIVE)
--         Capture IDs into rollback table
-- ============================================================

WITH inserted AS (
    INSERT INTO master_state_tax_rules (
        state,
        classification_id,
        is_taxable,
        explanation,
        qualifier_environment,
        qualifier_project_type,
        qualifier_separately_stated,
        effective_from,
        effective_through,
        statutory_effective_date,
        rule_version,
        is_active,
        superseded_by
    )
    SELECT
        m.state,
        mc.id,
        m.is_taxable,
        m.explanation,
        CASE m.environment
            WHEN 'both' THEN NULL
            ELSE m.environment
        END AS qualifier_environment,
        m.project_type AS qualifier_project_type,
        NULL AS qualifier_separately_stated,
        m.effective_from,
        NULL AS effective_through,
        m.statutory_effective_date,
        m.rule_version,
        true AS is_active,
        NULL AS superseded_by
    FROM state_tax_rules_matrix m
    LEFT JOIN tax_classifications tc ON m.tax_classification_id = tc.id
    LEFT JOIN special_charge_classifications sc ON m.special_charge_classification_id = sc.id
    JOIN master_classifications mc
        ON mc.code = COALESCE(tc.code, sc.code)
    WHERE m.state = 'KS'
        AND m.is_active = true
    RETURNING id
)
INSERT INTO _stage3_rollback_ids (id)
SELECT id FROM inserted;

-- ============================================================
-- PART B: Migrate 16 Missouri Material/Labor rules (INACTIVE)
--         Capture IDs into rollback table
-- ============================================================

WITH inserted AS (
    INSERT INTO master_state_tax_rules (
        state,
        classification_id,
        is_taxable,
        explanation,
        qualifier_environment,
        qualifier_project_type,
        qualifier_separately_stated,
        effective_from,
        effective_through,
        statutory_effective_date,
        rule_version,
        is_active,
        superseded_by
    )
    SELECT
        m.state,
        mc.id,
        m.is_taxable,
        m.explanation,
        CASE m.environment
            WHEN 'both' THEN NULL
            ELSE m.environment
        END AS qualifier_environment,
        m.project_type AS qualifier_project_type,
        NULL AS qualifier_separately_stated,
        m.effective_from,
        NULL AS effective_through,
        m.statutory_effective_date,
        m.rule_version,
        false AS is_active,
        NULL AS superseded_by
    FROM state_tax_rules_matrix m
    LEFT JOIN tax_classifications tc ON m.tax_classification_id = tc.id
    LEFT JOIN special_charge_classifications sc ON m.special_charge_classification_id = sc.id
    JOIN master_classifications mc
        ON mc.code = COALESCE(tc.code, sc.code)
    WHERE m.state = 'MO'
    RETURNING id
)
INSERT INTO _stage3_rollback_ids (id)
SELECT id FROM inserted;

-- ============================================================
-- PART C: Add Kansas Design Fee rule (ACTIVE, separately stated)
--         Capture ID into rollback table
-- ============================================================

WITH inserted AS (
    INSERT INTO master_state_tax_rules (
        state,
        classification_id,
        is_taxable,
        explanation,
        qualifier_environment,
        qualifier_project_type,
        qualifier_separately_stated,
        effective_from,
        effective_through,
        statutory_effective_date,
        rule_version,
        is_active,
        superseded_by
    )
    SELECT
        'KS',
        mc.id,
        false,
        'Separately stated design services are non-taxable under Kansas law.',
        NULL,
        NULL,
        true,
        CURRENT_DATE,
        NULL,
        NULL,
        1,
        true,
        NULL
    FROM master_classifications mc
    WHERE mc.code = 'design_fee'
    RETURNING id
)
INSERT INTO _stage3_rollback_ids (id)
SELECT id FROM inserted;

-- ============================================================
-- PART D: Add Kansas Freight/Delivery rule (ACTIVE, separately stated)
--         Capture ID into rollback table
-- ============================================================

WITH inserted AS (
    INSERT INTO master_state_tax_rules (
        state,
        classification_id,
        is_taxable,
        explanation,
        qualifier_environment,
        qualifier_project_type,
        qualifier_separately_stated,
        effective_from,
        effective_through,
        statutory_effective_date,
        rule_version,
        is_active,
        superseded_by
    )
    SELECT
        'KS',
        mc.id,
        false,
        'Separately stated delivery charges are non-taxable. K.S.A. 79-3602(i), effective July 1, 2023.',
        NULL,
        NULL,
        true,
        CURRENT_DATE,
        NULL,
        '2023-07-01',
        1,
        true,
        NULL
    FROM master_classifications mc
    WHERE mc.code = 'freight_delivery'
    RETURNING id
)
INSERT INTO _stage3_rollback_ids (id)
SELECT id FROM inserted;