/*
# Stage 5: Migrate Proposal Modifier Data

## Purpose
Migrates modifier data from proposal_settings (percentages) and proposals (amounts)
into the new transaction_modifiers table. Creates 24 rows (8 modifiers x 3 proposals).

## Migration Logic
- is_enabled = (percentage_value <> 0) for standard modifiers
- is_enabled = (custom_label IS NOT NULL AND percentage_value <> 0) for custom modifiers
- calculation_base = 'materials_labor' for all fixed-base modifiers
- calculation_base = COALESCE(p.misc_applies_to, 'materials_labor') for misc_parts
  (misc_applies_to is on proposals table, not proposal_settings)
- classification_id mapped from tax_classifications to master_classifications by code
- is_inherited = false, inherited_from_modifier_id = NULL for all proposal rows
- Each INSERT uses WITH inserted AS (INSERT ... RETURNING id) to capture IDs into _stage5_rollback_ids

## Expected Result
- 24 rows inserted into transaction_modifiers (all proposal-owned)
- 24 rows inserted into _stage5_rollback_ids
*/

-- 1. discount (sort_order 1)
WITH inserted AS (
    INSERT INTO transaction_modifiers (
        organization_id, proposal_id, modifier_key, is_enabled,
        is_inherited, inherited_from_modifier_id,
        modifier_type, percentage_value, calculation_base,
        calculated_amount, sort_order
    )
    SELECT
        ps.organization_id,
        ps.proposal_id,
        'discount',
        (ps.discount_percent <> 0),
        false, NULL,
        'percentage',
        ps.discount_percent,
        'materials_labor',
        p.discount_amount,
        1
    FROM proposal_settings ps
    JOIN proposals p ON p.id = ps.proposal_id
    RETURNING id
)
INSERT INTO _stage5_rollback_ids (table_name, row_id)
SELECT 'transaction_modifiers', id FROM inserted;

-- 2. project_management (sort_order 2)
WITH inserted AS (
    INSERT INTO transaction_modifiers (
        organization_id, proposal_id, modifier_key, is_enabled,
        is_inherited, inherited_from_modifier_id,
        modifier_type, percentage_value, calculation_base,
        calculated_amount, sort_order
    )
    SELECT
        ps.organization_id,
        ps.proposal_id,
        'project_management',
        (ps.project_management_percent <> 0),
        false, NULL,
        'percentage',
        ps.project_management_percent,
        'materials_labor',
        p.project_management_amount,
        2
    FROM proposal_settings ps
    JOIN proposals p ON p.id = ps.proposal_id
    RETURNING id
)
INSERT INTO _stage5_rollback_ids (table_name, row_id)
SELECT 'transaction_modifiers', id FROM inserted;

-- 3. project_design (sort_order 3)
WITH inserted AS (
    INSERT INTO transaction_modifiers (
        organization_id, proposal_id, modifier_key, is_enabled,
        is_inherited, inherited_from_modifier_id,
        modifier_type, percentage_value, calculation_base,
        calculated_amount, sort_order
    )
    SELECT
        ps.organization_id,
        ps.proposal_id,
        'project_design',
        (ps.project_design_percent <> 0),
        false, NULL,
        'percentage',
        ps.project_design_percent,
        'materials_labor',
        p.project_design_amount,
        3
    FROM proposal_settings ps
    JOIN proposals p ON p.id = ps.proposal_id
    RETURNING id
)
INSERT INTO _stage5_rollback_ids (table_name, row_id)
SELECT 'transaction_modifiers', id FROM inserted;

-- 4. system_design (sort_order 4)
WITH inserted AS (
    INSERT INTO transaction_modifiers (
        organization_id, proposal_id, modifier_key, is_enabled,
        is_inherited, inherited_from_modifier_id,
        modifier_type, percentage_value, calculation_base,
        calculated_amount, sort_order
    )
    SELECT
        ps.organization_id,
        ps.proposal_id,
        'system_design',
        (ps.system_design_percent <> 0),
        false, NULL,
        'percentage',
        ps.system_design_percent,
        'materials_labor',
        p.system_design_amount,
        4
    FROM proposal_settings ps
    JOIN proposals p ON p.id = ps.proposal_id
    RETURNING id
)
INSERT INTO _stage5_rollback_ids (table_name, row_id)
SELECT 'transaction_modifiers', id FROM inserted;

-- 5. credit_card_fee (sort_order 5)
WITH inserted AS (
    INSERT INTO transaction_modifiers (
        organization_id, proposal_id, modifier_key, is_enabled,
        is_inherited, inherited_from_modifier_id,
        modifier_type, percentage_value, calculation_base,
        calculated_amount, sort_order
    )
    SELECT
        ps.organization_id,
        ps.proposal_id,
        'credit_card_fee',
        (ps.credit_card_fee_percent <> 0),
        false, NULL,
        'percentage',
        ps.credit_card_fee_percent,
        'materials_labor',
        p.credit_card_fee_amount,
        5
    FROM proposal_settings ps
    JOIN proposals p ON p.id = ps.proposal_id
    RETURNING id
)
INSERT INTO _stage5_rollback_ids (table_name, row_id)
SELECT 'transaction_modifiers', id FROM inserted;

-- 6. misc_parts (sort_order 6, calculation_base from proposals.misc_applies_to)
WITH inserted AS (
    INSERT INTO transaction_modifiers (
        organization_id, proposal_id, modifier_key, is_enabled,
        is_inherited, inherited_from_modifier_id,
        modifier_type, percentage_value, calculation_base,
        calculated_amount, sort_order
    )
    SELECT
        ps.organization_id,
        ps.proposal_id,
        'misc_parts',
        (ps.misc_parts_percent <> 0),
        false, NULL,
        'percentage',
        ps.misc_parts_percent,
        COALESCE(p.misc_applies_to, 'materials_labor'),
        p.misc_parts_amount,
        6
    FROM proposal_settings ps
    JOIN proposals p ON p.id = ps.proposal_id
    RETURNING id
)
INSERT INTO _stage5_rollback_ids (table_name, row_id)
SELECT 'transaction_modifiers', id FROM inserted;

-- 7. custom_modifier_1 (sort_order 7, classification mapped by code)
WITH inserted AS (
    INSERT INTO transaction_modifiers (
        organization_id, proposal_id, modifier_key, is_enabled,
        is_inherited, inherited_from_modifier_id,
        modifier_type, percentage_value, calculation_base,
        custom_label, classification_id,
        calculated_amount, sort_order
    )
    SELECT
        ps.organization_id,
        ps.proposal_id,
        'custom_modifier_1',
        (ps.custom_modifier_1_label IS NOT NULL AND ps.custom_modifier_1_percent <> 0),
        false, NULL,
        'percentage',
        ps.custom_modifier_1_percent,
        'materials_labor',
        ps.custom_modifier_1_label,
        mc.id,
        p.custom_modifier_1_amount,
        7
    FROM proposal_settings ps
    JOIN proposals p ON p.id = ps.proposal_id
    LEFT JOIN tax_classifications tc
        ON tc.id = ps.custom_modifier_1_tax_classification_id
    LEFT JOIN master_classifications mc
        ON mc.code = tc.code
    RETURNING id
)
INSERT INTO _stage5_rollback_ids (table_name, row_id)
SELECT 'transaction_modifiers', id FROM inserted;

-- 8. custom_modifier_2 (sort_order 8, classification mapped by code)
WITH inserted AS (
    INSERT INTO transaction_modifiers (
        organization_id, proposal_id, modifier_key, is_enabled,
        is_inherited, inherited_from_modifier_id,
        modifier_type, percentage_value, calculation_base,
        custom_label, classification_id,
        calculated_amount, sort_order
    )
    SELECT
        ps.organization_id,
        ps.proposal_id,
        'custom_modifier_2',
        (ps.custom_modifier_2_label IS NOT NULL AND ps.custom_modifier_2_percent <> 0),
        false, NULL,
        'percentage',
        ps.custom_modifier_2_percent,
        'materials_labor',
        ps.custom_modifier_2_label,
        mc.id,
        p.custom_modifier_2_amount,
        8
    FROM proposal_settings ps
    JOIN proposals p ON p.id = ps.proposal_id
    LEFT JOIN tax_classifications tc
        ON tc.id = ps.custom_modifier_2_tax_classification_id
    LEFT JOIN master_classifications mc
        ON mc.code = tc.code
    RETURNING id
)
INSERT INTO _stage5_rollback_ids (table_name, row_id)
SELECT 'transaction_modifiers', id FROM inserted;