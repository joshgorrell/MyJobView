/*
# Stage 5: Create transaction_modifiers table

## Purpose
Normalizes modifier data (discount, project management, system design, credit card fee,
misc parts, custom modifiers) from scattered columns on proposals/proposal_settings/change_orders
into a single normalized table. This is additive only -- no existing tables are modified,
no application code reads from this table yet.

## New Table: transaction_modifiers
- id (uuid PK)
- organization_id (uuid FK -> organizations, CASCADE)
- proposal_id (uuid FK -> proposals, CASCADE) -- nullable, one owner
- change_order_id (uuid FK -> change_orders, CASCADE) -- nullable, one owner
- modifier_key (text, CHECK enum of 8 valid keys)
- is_enabled (boolean, default false)
- is_inherited (boolean, default false) -- CO-only inheritance tracking
- inherited_from_modifier_id (uuid FK -> transaction_modifiers, RESTRICT) -- self-ref
- modifier_type (text, 'percentage' or 'fixed_amount')
- percentage_value (numeric(10,2)) -- required for percentage type
- fixed_amount_value (numeric(12,2)) -- required for fixed_amount type
- calculation_base (text, NULL or materials/labor/materials_labor)
- custom_label (text) -- only for custom_modifier_1/2
- classification_id (uuid FK -> master_classifications, SET NULL) -- only for custom modifiers
- sort_order (integer, default 0)
- calculated_amount (numeric(12,2), default 0) -- cached current calculated result
- created_at, updated_at (timestamptz)

## Constraints (12 CHECK constraints)
1. tm_exactly_one_owner: exactly one of proposal_id/change_order_id must be non-NULL
2. tm_pct_requires_value: percentage type requires percentage_value, no fixed_amount_value
3. tm_fixed_requires_value: fixed_amount type requires fixed_amount_value, no percentage_value
4. tm_pct_requires_base: percentage type requires non-NULL calculation_base
5. tm_fixed_requires_null_base: fixed_amount type requires NULL calculation_base
6. tm_fixed_base_modifiers_use_materials_labor: discount/PM/PD/SD/CC percentage must use materials_labor
7. tm_discount_nonnegative: discount percentage_value and fixed_amount_value must be >= 0
8. tm_custom_enabled_requires_label: enabled custom modifiers require custom_label AND classification_id
9. tm_classification_only_for_custom: classification_id only for custom_modifier_1/2
10. tm_label_only_for_custom: custom_label only for custom_modifier_1/2
11. tm_inherited_only_for_co: inherited_from_modifier_id only valid for CO-owned rows
12. tm_inherited_requires_link: is_inherited and inherited_from_modifier_id must be both set or both NULL

## Indexes
- tm_pkey (PK on id)
- tm_proposal_key_unique: UNIQUE (proposal_id, modifier_key) WHERE proposal_id IS NOT NULL
- tm_co_key_unique: UNIQUE (change_order_id, modifier_key) WHERE change_order_id IS NOT NULL
- tm_org_idx: (organization_id, sort_order)
- tm_inherited_from_idx: partial on inherited_from_modifier_id WHERE NOT NULL
- tm_classification_idx: partial on classification_id WHERE NOT NULL

## FKs
- organization_id -> organizations(id) ON DELETE CASCADE
- proposal_id -> proposals(id) ON DELETE CASCADE
- change_order_id -> change_orders(id) ON DELETE CASCADE
- classification_id -> master_classifications(id) ON DELETE SET NULL
- inherited_from_modifier_id -> transaction_modifiers(id) ON DELETE RESTRICT

## RLS
- Enabled on transaction_modifiers
- 4 policies: SELECT (same org), INSERT/UPDATE/DELETE (admin/manager same org)
- Uses (select get_user_org_id()) and (select auth.uid()) for initplan optimization

## Triggers
1. tm_validate_inheritance: BEFORE INSERT OR UPDATE OF inherited_from_modifier_id
   - Validates source is Proposal-owned, modifier_key matches, organization_id matches
2. update_transaction_modifiers_updated_at: BEFORE UPDATE
   - Auto-updates updated_at column

## Rollback table
- _stage5_rollback_ids: tracks exact row IDs inserted by Stage 5 migration
*/

-- ============================================================
-- 1. CREATE TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS transaction_modifiers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL,

    -- Exactly one owner (enforced by CHECK)
    proposal_id uuid,
    change_order_id uuid,

    modifier_key text NOT NULL CHECK (modifier_key IN (
        'discount', 'project_management', 'project_design',
        'system_design', 'credit_card_fee', 'misc_parts',
        'custom_modifier_1', 'custom_modifier_2'
    )),

    is_enabled boolean NOT NULL DEFAULT false,

    -- Inheritance tracking (Change Order rows only)
    is_inherited boolean NOT NULL DEFAULT false,
    inherited_from_modifier_id uuid,

    modifier_type text NOT NULL DEFAULT 'percentage'
        CHECK (modifier_type IN ('percentage', 'fixed_amount')),
    percentage_value numeric(10,2),
    fixed_amount_value numeric(12,2),

    -- Explicit calculation base for percentage modifiers
    -- NULL only valid for fixed_amount modifiers
    calculation_base text
        CHECK (calculation_base IS NULL OR calculation_base IN (
            'materials', 'labor', 'materials_labor'
        )),

    custom_label text,
    classification_id uuid,
    sort_order integer NOT NULL DEFAULT 0,

    -- Cached current calculated result (NOT the immutable tax snapshot)
    calculated_amount numeric(12,2) NOT NULL DEFAULT 0,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraint 1: Exactly one owner
    CONSTRAINT tm_exactly_one_owner
        CHECK (num_nonnulls(proposal_id, change_order_id) = 1),

    -- Constraint 2: Percentage type requires percentage_value, no fixed_amount_value
    CONSTRAINT tm_pct_requires_value
        CHECK (modifier_type <> 'percentage'
            OR (percentage_value IS NOT NULL AND fixed_amount_value IS NULL)),

    -- Constraint 3: Fixed amount type requires fixed_amount_value, no percentage_value
    CONSTRAINT tm_fixed_requires_value
        CHECK (modifier_type <> 'fixed_amount'
            OR (fixed_amount_value IS NOT NULL AND percentage_value IS NULL)),

    -- Constraint 4: All percentage modifiers require non-NULL calculation_base
    CONSTRAINT tm_pct_requires_base
        CHECK (modifier_type <> 'percentage' OR calculation_base IS NOT NULL),

    -- Constraint 5: All fixed_amount modifiers require NULL calculation_base
    CONSTRAINT tm_fixed_requires_null_base
        CHECK (modifier_type <> 'fixed_amount' OR calculation_base IS NULL),

    -- Constraint 6: Fixed-base percentage modifiers must use materials_labor
    -- (discount, project_management, project_design, system_design, credit_card_fee)
    CONSTRAINT tm_fixed_base_modifiers_use_materials_labor
        CHECK (
            modifier_type <> 'percentage'
            OR modifier_key IN ('misc_parts', 'custom_modifier_1', 'custom_modifier_2')
            OR calculation_base = 'materials_labor'
        ),

    -- Constraint 7: Discount sign convention -- positive magnitude only
    CONSTRAINT tm_discount_nonnegative
        CHECK (
            modifier_key <> 'discount'
            OR (
                (percentage_value IS NULL OR percentage_value >= 0)
                AND (fixed_amount_value IS NULL OR fixed_amount_value >= 0)
            )
        ),

    -- Constraint 8: Custom modifiers if enabled require label AND classification
    CONSTRAINT tm_custom_enabled_requires_label
        CHECK (modifier_key NOT IN ('custom_modifier_1', 'custom_modifier_2')
            OR (is_enabled = false
                OR (is_enabled = true AND custom_label IS NOT NULL
                    AND classification_id IS NOT NULL))),

    -- Constraint 9: classification_id only for custom modifiers
    CONSTRAINT tm_classification_only_for_custom
        CHECK (classification_id IS NULL
            OR modifier_key IN ('custom_modifier_1', 'custom_modifier_2')),

    -- Constraint 10: custom_label only for custom modifiers
    CONSTRAINT tm_label_only_for_custom
        CHECK (custom_label IS NULL
            OR modifier_key IN ('custom_modifier_1', 'custom_modifier_2')),

    -- Constraint 11: inherited_from_modifier_id only for CO-owned rows
    CONSTRAINT tm_inherited_only_for_co
        CHECK (
            (inherited_from_modifier_id IS NULL)
            OR (change_order_id IS NOT NULL AND proposal_id IS NULL)
        ),

    -- Constraint 12: is_inherited and inherited_from_modifier_id both set or both NULL
    CONSTRAINT tm_inherited_requires_link
        CHECK (
            (is_inherited = false AND inherited_from_modifier_id IS NULL)
            OR (is_inherited = true AND inherited_from_modifier_id IS NOT NULL)
        )
);

-- ============================================================
-- 2. FOREIGN KEYS
-- ============================================================

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'tm_org_fkey' AND table_name = 'transaction_modifiers'
    ) THEN
        ALTER TABLE transaction_modifiers
            ADD CONSTRAINT tm_org_fkey
            FOREIGN KEY (organization_id)
            REFERENCES organizations(id) ON DELETE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'tm_proposal_fkey' AND table_name = 'transaction_modifiers'
    ) THEN
        ALTER TABLE transaction_modifiers
            ADD CONSTRAINT tm_proposal_fkey
            FOREIGN KEY (proposal_id)
            REFERENCES proposals(id) ON DELETE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'tm_change_order_fkey' AND table_name = 'transaction_modifiers'
    ) THEN
        ALTER TABLE transaction_modifiers
            ADD CONSTRAINT tm_change_order_fkey
            FOREIGN KEY (change_order_id)
            REFERENCES change_orders(id) ON DELETE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'tm_classification_fkey' AND table_name = 'transaction_modifiers'
    ) THEN
        ALTER TABLE transaction_modifiers
            ADD CONSTRAINT tm_classification_fkey
            FOREIGN KEY (classification_id)
            REFERENCES master_classifications(id) ON DELETE SET NULL;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'tm_inherited_from_fkey' AND table_name = 'transaction_modifiers'
    ) THEN
        ALTER TABLE transaction_modifiers
            ADD CONSTRAINT tm_inherited_from_fkey
            FOREIGN KEY (inherited_from_modifier_id)
            REFERENCES transaction_modifiers(id) ON DELETE RESTRICT;
    END IF;
END $$;

-- ============================================================
-- 3. INDEXES
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS tm_proposal_key_unique
    ON transaction_modifiers (proposal_id, modifier_key)
    WHERE proposal_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tm_co_key_unique
    ON transaction_modifiers (change_order_id, modifier_key)
    WHERE change_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS tm_org_idx
    ON transaction_modifiers (organization_id, sort_order);

CREATE INDEX IF NOT EXISTS tm_inherited_from_idx
    ON transaction_modifiers (inherited_from_modifier_id)
    WHERE inherited_from_modifier_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS tm_classification_idx
    ON transaction_modifiers (classification_id)
    WHERE classification_id IS NOT NULL;

-- ============================================================
-- 4. ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE transaction_modifiers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tm_select_same_org" ON transaction_modifiers;
CREATE POLICY "tm_select_same_org" ON transaction_modifiers FOR SELECT
    TO authenticated
    USING (organization_id = (select get_user_org_id()));

DROP POLICY IF EXISTS "tm_insert_admin" ON transaction_modifiers;
CREATE POLICY "tm_insert_admin" ON transaction_modifiers FOR INSERT
    TO authenticated
    WITH CHECK (
        organization_id = (select get_user_org_id())
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (select auth.uid())
            AND profiles.role IN ('admin', 'manager')
        )
    );

DROP POLICY IF EXISTS "tm_update_admin" ON transaction_modifiers;
CREATE POLICY "tm_update_admin" ON transaction_modifiers FOR UPDATE
    TO authenticated
    USING (
        organization_id = (select get_user_org_id())
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (select auth.uid())
            AND profiles.role IN ('admin', 'manager')
        )
    )
    WITH CHECK (
        organization_id = (select get_user_org_id())
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (select auth.uid())
            AND profiles.role IN ('admin', 'manager')
        )
    );

DROP POLICY IF EXISTS "tm_delete_admin" ON transaction_modifiers;
CREATE POLICY "tm_delete_admin" ON transaction_modifiers FOR DELETE
    TO authenticated
    USING (
        organization_id = (select get_user_org_id())
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (select auth.uid())
            AND profiles.role IN ('admin', 'manager')
        )
    );

-- ============================================================
-- 5. INHERITANCE VALIDATION TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION validate_tm_inheritance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    source_row record;
BEGIN
    IF NEW.inherited_from_modifier_id IS NOT NULL THEN
        SELECT modifier_key, organization_id, proposal_id, change_order_id
        INTO source_row
        FROM transaction_modifiers
        WHERE id = NEW.inherited_from_modifier_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION
                'inherited_from_modifier_id % does not exist',
                NEW.inherited_from_modifier_id;
        END IF;

        -- Rule 1: source must be Proposal-owned (proposal_id NOT NULL, change_order_id NULL)
        IF source_row.proposal_id IS NULL OR source_row.change_order_id IS NOT NULL THEN
            RAISE EXCEPTION
                'inherited_from_modifier_id must reference a Proposal-owned modifier, '
                'but id % is not Proposal-owned',
                NEW.inherited_from_modifier_id;
        END IF;

        -- Rule 2: modifier_key must match
        IF source_row.modifier_key <> NEW.modifier_key THEN
            RAISE EXCEPTION
                'inherited_from_modifier_id has modifier_key %, but child has %',
                source_row.modifier_key, NEW.modifier_key;
        END IF;

        -- Rule 3: organization_id must match
        IF source_row.organization_id <> NEW.organization_id THEN
            RAISE EXCEPTION
                'inherited_from_modifier_id has organization_id %, but child has %',
                source_row.organization_id, NEW.organization_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tm_validate_inheritance ON transaction_modifiers;
CREATE TRIGGER tm_validate_inheritance
    BEFORE INSERT OR UPDATE OF inherited_from_modifier_id
    ON transaction_modifiers
    FOR EACH ROW
    EXECUTE FUNCTION validate_tm_inheritance();

-- ============================================================
-- 6. UPDATED_AT TRIGGER
-- ============================================================

DROP TRIGGER IF EXISTS update_transaction_modifiers_updated_at ON transaction_modifiers;
CREATE TRIGGER update_transaction_modifiers_updated_at
    BEFORE UPDATE ON transaction_modifiers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 7. ROLLBACK TRACKING TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS _stage5_rollback_ids (
    table_name text NOT NULL,
    row_id uuid NOT NULL,
    PRIMARY KEY (table_name, row_id)
);