/*
# Stage 5: Migrate Change Order Modifier Data

## Purpose
Migrates modifier data from change_orders into the new transaction_modifiers table.
Creates 24 rows (8 modifiers x 3 change orders).

## Migration Logic
- is_enabled = apply_* (the stored boolean, preserving exact enabled state)
- is_inherited = false, inherited_from_modifier_id = NULL for all CO rows
- calculation_base = 'materials_labor' for all fixed-base modifiers
- calculation_base = COALESCE(misc_applies_to, 'materials_labor') for misc_parts
- classification_id mapped from tax_classifications to master_classifications by code
- Each INSERT uses WITH inserted AS (INSERT ... RETURNING id) to capture IDs into _stage5_rollback_ids

## Expected Result
- 24 rows inserted into transaction_modifiers (all CO-owned)
- 24 rows inserted into _stage5_rollback_ids (total now 48)
*/

-- 1. discount (sort_order 1)
WITH inserted AS (
    INSERT INTO transaction_modifiers (
        organization_id, change_order_id, modifier_key, is_enabled,
        is_inherited, inherited_from_modifier_id,
        modifier_type, percentage_value, calculation_base,
        calculated_amount, sort_order
    )
    SELECT
        organization_id,
        id,
        'discount',
        apply_discount,
        false, NULL,
        'percentage',
        discount_percent,
        'materials_labor',
        discount_amount,
        1
    FROM change_orders
    RETURNING id
)
INSERT INTO _stage5_rollback_ids (table_name, row_id)
SELECT 'transaction_modifiers', id FROM inserted;

-- 2. project_management (sort_order 2)
WITH inserted AS (
    INSERT INTO transaction_modifiers (
        organization_id, change_order_id, modifier_key, is_enabled,
        is_inherited, inherited_from_modifier_id,
        modifier_type, percentage_value, calculation_base,
        calculated_amount, sort_order
    )
    SELECT
        organization_id,
        id,
        'project_management',
        apply_project_management,
        false, NULL,
        'percentage',
        project_management_percent,
        'materials_labor',
        project_management_amount,
        2
    FROM change_orders
    RETURNING id
)
INSERT INTO _stage5_rollback_ids (table_name, row_id)
SELECT 'transaction_modifiers', id FROM inserted;

-- 3. project_design (sort_order 3)
WITH inserted AS (
    INSERT INTO transaction_modifiers (
        organization_id, change_order_id, modifier_key, is_enabled,
        is_inherited, inherited_from_modifier_id,
        modifier_type, percentage_value, calculation_base,
        calculated_amount, sort_order
    )
    SELECT
        organization_id,
        id,
        'project_design',
        apply_project_design,
        false, NULL,
        'percentage',
        project_design_percent,
        'materials_labor',
        project_design_amount,
        3
    FROM change_orders
    RETURNING id
)
INSERT INTO _stage5_rollback_ids (table_name, row_id)
SELECT 'transaction_modifiers', id FROM inserted;

-- 4. system_design (sort_order 4)
WITH inserted AS (
    INSERT INTO transaction_modifiers (
        organization_id, change_order_id, modifier_key, is_enabled,
        is_inherited, inherited_from_modifier_id,
        modifier_type, percentage_value, calculation_base,
        calculated_amount, sort_order
    )
    SELECT
        organization_id,
        id,
        'system_design',
        apply_system_design,
        false, NULL,
        'percentage',
        system_design_percent,
        'materials_labor',
        system_design_amount,
        4
    FROM change_orders
    RETURNING id
)
INSERT INTO _stage5_rollback_ids (table_name, row_id)
SELECT 'transaction_modifiers', id FROM inserted;

-- 5. credit_card_fee (sort_order 5)
WITH inserted AS (
    INSERT INTO transaction_modifiers (
        organization_id, change_order_id, modifier_key, is_enabled,
        is_inherited, inherited_from_modifier_id,
        modifier_type, percentage_value, calculation_base,
        calculated_amount, sort_order
    )
    SELECT
        organization_id,
        id,
        'credit_card_fee',
        apply_credit_card_fee,
        false, NULL,
        'percentage',
        credit_card_fee_percent,
        'materials_labor',
        credit_card_fee_amount,
        5
    FROM change_orders
    RETURNING id
)
INSERT INTO _stage5_rollback_ids (table_name, row_id)
SELECT 'transaction_modifiers', id FROM inserted;

-- 6. misc_parts (sort_order 6, calculation_base from misc_applies_to)
WITH inserted AS (
    INSERT INTO transaction_modifiers (
        organization_id, change_order_id, modifier_key, is_enabled,
        is_inherited, inherited_from_modifier_id,
        modifier_type, percentage_value, calculation_base,
        calculated_amount, sort_order
    )
    SELECT
        organization_id,
        id,
        'misc_parts',
        apply_misc_parts,
        false, NULL,
        'percentage',
        misc_parts_percent,
        COALESCE(misc_applies_to, 'materials_labor'),
        misc_parts_amount,
        6
    FROM change_orders
    RETURNING id
)
INSERT INTO _stage5_rollback_ids (table_name, row_id)
SELECT 'transaction_modifiers', id FROM inserted;

-- 7. custom_modifier_1 (sort_order 7, classification mapped by code)
WITH inserted AS (
    INSERT INTO transaction_modifiers (
        organization_id, change_order_id, modifier_key, is_enabled,
        is_inherited, inherited_from_modifier_id,
        modifier_type, percentage_value, calculation_base,
        custom_label, classification_id,
        calculated_amount, sort_order
    )
    SELECT
        co.organization_id,
        co.id,
        'custom_modifier_1',
        co.apply_custom_modifier_1,
        false, NULL,
        'percentage',
        co.custom_modifier_1_percent,
        'materials_labor',
        co.custom_modifier_1_label,
        mc.id,
        co.custom_modifier_1_amount,
        7
    FROM change_orders co
    LEFT JOIN tax_classifications tc
        ON tc.id = co.custom_modifier_1_tax_classification_id
    LEFT JOIN master_classifications mc
        ON mc.code = tc.code
    RETURNING id
)
INSERT INTO _stage5_rollback_ids (table_name, row_id)
SELECT 'transaction_modifiers', id FROM inserted;

-- 8. custom_modifier_2 (sort_order 8, classification mapped by code)
WITH inserted AS (
    INSERT INTO transaction_modifiers (
        organization_id, change_order_id, modifier_key, is_enabled,
        is_inherited, inherited_from_modifier_id,
        modifier_type, percentage_value, calculation_base,
        custom_label, classification_id,
        calculated_amount, sort_order
    )
    SELECT
        co.organization_id,
        co.id,
        'custom_modifier_2',
        co.apply_custom_modifier_2,
        false, NULL,
        'percentage',
        co.custom_modifier_2_percent,
        'materials_labor',
        co.custom_modifier_2_label,
        mc.id,
        co.custom_modifier_2_amount,
        8
    FROM change_orders co
    LEFT JOIN tax_classifications tc
        ON tc.id = co.custom_modifier_2_tax_classification_id
    LEFT JOIN master_classifications mc
        ON mc.code = tc.code
    RETURNING id
)
INSERT INTO _stage5_rollback_ids (table_name, row_id)
SELECT 'transaction_modifiers', id FROM inserted;