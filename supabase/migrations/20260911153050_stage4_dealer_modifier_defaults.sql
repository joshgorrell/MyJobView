/*
 * Stage 4: Dealer Modifier Defaults Table
 *
 * Stores each dealer's default settings for proposal modifiers.
 * All eight modifier features remain available regardless of `enabled` --
 * `enabled` means "applied by default to new transactions," NOT "feature available."
 *
 * Supported modifier_key values:
 *   discount, project_management, project_design, system_design,
 *   credit_card_fee, misc_parts, custom_modifier_1, custom_modifier_2
 *
 * No freight modifier -- Freight/Delivery is a master tax classification
 * but there is no confirmed customer-facing Proposal Freight input.
 *
 * Custom modifier constraints:
 *   - If enabled = true: custom_label and classification_id are required
 *   - If enabled = false: custom_label and classification_id may be NULL
 *
 * Type constraints:
 *   - percentage: percentage_value required, fixed_amount_value NULL
 *   - fixed_amount: fixed_amount_value required, percentage_value NULL
 *
 * Tax behavior for misc_parts:
 *   The calculation base may be materials, labor, or materials + labor.
 *   The resulting Misc dollar amount is always classified as Material for tax purposes.
 *   No separate Misc tax classification is created.
 */

CREATE TABLE dealer_modifier_defaults (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL,
    modifier_key text NOT NULL
        CHECK (modifier_key IN (
            'discount',
            'project_management',
            'project_design',
            'system_design',
            'credit_card_fee',
            'misc_parts',
            'custom_modifier_1',
            'custom_modifier_2'
        )),
    enabled boolean NOT NULL DEFAULT false,
    modifier_type text NOT NULL DEFAULT 'percentage'
        CHECK (modifier_type IN ('percentage', 'fixed_amount')),
    percentage_value numeric(10,2),
    fixed_amount_value numeric(12,2),
    misc_applies_to text
        CHECK (misc_applies_to IS NULL OR misc_applies_to IN ('materials', 'labor', 'materials_labor')),
    custom_label text,
    classification_id uuid,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT dealer_modifier_defaults_org_key_unique
        UNIQUE (organization_id, modifier_key),

    -- Percentage type: percentage_value required, fixed_amount_value must be NULL
    CONSTRAINT dealer_modifier_pct_requires_value
        CHECK (
            (modifier_type <> 'percentage')
            OR (percentage_value IS NOT NULL AND fixed_amount_value IS NULL)
        ),

    -- Fixed amount type: fixed_amount_value required, percentage_value must be NULL
    CONSTRAINT dealer_modifier_fixed_requires_value
        CHECK (
            (modifier_type <> 'fixed_amount')
            OR (fixed_amount_value IS NOT NULL AND percentage_value IS NULL)
        ),

    -- Custom modifiers: if enabled, custom_label and classification_id required
    -- If disabled, both may be NULL
    CONSTRAINT dealer_modifier_custom_enabled_requires_label
        CHECK (
            (modifier_key NOT IN ('custom_modifier_1', 'custom_modifier_2'))
            OR (
                enabled = false
                OR (
                    enabled = true
                    AND custom_label IS NOT NULL
                    AND classification_id IS NOT NULL
                )
            )
        ),

    -- misc_applies_to only valid for misc_parts modifier
    CONSTRAINT dealer_modifier_misc_applies_to_only_for_misc
        CHECK (
            misc_applies_to IS NULL
            OR modifier_key = 'misc_parts'
        ),

    -- classification_id only valid for custom modifiers
    CONSTRAINT dealer_modifier_classification_only_for_custom
        CHECK (
            classification_id IS NULL
            OR modifier_key IN ('custom_modifier_1', 'custom_modifier_2')
        ),

    -- custom_label only valid for custom modifiers
    CONSTRAINT dealer_modifier_label_only_for_custom
        CHECK (
            custom_label IS NULL
            OR modifier_key IN ('custom_modifier_1', 'custom_modifier_2')
        )
);

-- Index for lookups by organization
CREATE INDEX dealer_modifier_defaults_org_idx
    ON dealer_modifier_defaults (organization_id, sort_order);

-- Foreign key to organizations
ALTER TABLE dealer_modifier_defaults
    ADD CONSTRAINT dealer_modifier_defaults_org_fkey
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- Foreign key to master_classifications for custom modifier tax classification
ALTER TABLE dealer_modifier_defaults
    ADD CONSTRAINT dealer_modifier_defaults_classification_fkey
    FOREIGN KEY (classification_id) REFERENCES master_classifications(id);

-- updated_at trigger
CREATE TRIGGER update_dealer_modifier_defaults_updated_at
    BEFORE UPDATE ON dealer_modifier_defaults
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE dealer_modifier_defaults ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES
-- SELECT: all authenticated users in same org
-- INSERT/UPDATE/DELETE: admin/manager in same org ONLY
-- No broad same-org write policies (permissive policies are OR'd)
-- ============================================================

CREATE POLICY dealer_modifier_defaults_select_same_org
    ON dealer_modifier_defaults FOR SELECT
    USING (organization_id = get_user_org_id());

CREATE POLICY dealer_modifier_defaults_insert_admin
    ON dealer_modifier_defaults FOR INSERT
    WITH CHECK (
        organization_id = get_user_org_id()
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'manager')
        )
    );

CREATE POLICY dealer_modifier_defaults_update_admin
    ON dealer_modifier_defaults FOR UPDATE
    USING (
        organization_id = get_user_org_id()
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'manager')
        )
    )
    WITH CHECK (
        organization_id = get_user_org_id()
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'manager')
        )
    );

CREATE POLICY dealer_modifier_defaults_delete_admin
    ON dealer_modifier_defaults FOR DELETE
    USING (
        organization_id = get_user_org_id()
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'manager')
        )
    );

-- ============================================================
-- Seed: Electronic Life 8 modifier default rows
-- ============================================================

INSERT INTO dealer_modifier_defaults (
    organization_id, modifier_key, enabled, modifier_type,
    percentage_value, fixed_amount_value, misc_applies_to,
    custom_label, classification_id, sort_order
)
VALUES
    (
        'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15',
        'discount',
        false,
        'percentage',
        0.00,
        NULL,
        NULL, NULL, NULL,
        1
    ),
    (
        'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15',
        'project_management',
        false,
        'percentage',
        0.00,
        NULL,
        NULL, NULL, NULL,
        2
    ),
    (
        'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15',
        'project_design',
        false,
        'percentage',
        0.00,
        NULL,
        NULL, NULL, NULL,
        3
    ),
    (
        'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15',
        'system_design',
        false,
        'percentage',
        0.00,
        NULL,
        NULL, NULL, NULL,
        4
    ),
    (
        'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15',
        'credit_card_fee',
        false,
        'percentage',
        0.00,
        NULL,
        NULL, NULL, NULL,
        5
    ),
    (
        'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15',
        'misc_parts',
        true,
        'percentage',
        3.00,
        NULL,
        'materials_labor',
        NULL, NULL,
        6
    ),
    (
        'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15',
        'custom_modifier_1',
        false,
        'percentage',
        0.00,
        NULL,
        NULL,
        NULL, NULL,
        7
    ),
    (
        'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15',
        'custom_modifier_2',
        false,
        'percentage',
        0.00,
        NULL,
        NULL,
        NULL, NULL,
        8
    );
