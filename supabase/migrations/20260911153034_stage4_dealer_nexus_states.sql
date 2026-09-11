/*
 * Stage 4: Dealer Nexus States Table
 *
 * Tracks each dealer's tax nexus status per state, separate from the
 * MJV master state-law rules. Preserves the distinction between:
 *   - effective_from: the date nexus legally took effect (NULL if unknown)
 *   - mjv_baseline_date: the date this row was migrated/established in the system
 *
 * Do NOT fabricate a historical legal effective date.
 *
 * History: Multiple historical rows per organization/state are allowed.
 * Only one current row per organization/state is permitted (partial unique index).
 */

CREATE TABLE dealer_nexus_states (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL,
    state text NOT NULL,
    nexus_status text NOT NULL DEFAULT 'unknown'
        CHECK (nexus_status IN ('yes', 'no', 'unknown')),
    nexus_type text,
    registration_date date,
    determination_date date,
    determination_notes text,
    source text NOT NULL DEFAULT 'manual',
    mjv_baseline_date date NOT NULL DEFAULT CURRENT_DATE,
    effective_from date,
    effective_through date,
    is_current boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Date validation: effective_through must not precede effective_from
    -- NULLs allowed (open-ended or unknown)
    CONSTRAINT dealer_nexus_states_date_order
        CHECK (
            effective_through IS NULL
            OR effective_from IS NULL
            OR effective_through >= effective_from
        )
);

-- Index for lookups by organization
CREATE INDEX dealer_nexus_states_org_idx
    ON dealer_nexus_states (organization_id, is_current);

-- Index for state-level queries
CREATE INDEX dealer_nexus_states_state_idx
    ON dealer_nexus_states (state);

-- Partial unique index: one current determination per dealer/state
-- Allows historical rows (is_current = false) to coexist
CREATE UNIQUE INDEX dealer_nexus_states_one_current_idx
    ON dealer_nexus_states (organization_id, state)
    WHERE is_current = true;

-- Foreign key to organizations
ALTER TABLE dealer_nexus_states
    ADD CONSTRAINT dealer_nexus_states_org_fkey
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- updated_at trigger
CREATE TRIGGER update_dealer_nexus_states_updated_at
    BEFORE UPDATE ON dealer_nexus_states
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE dealer_nexus_states ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES
-- SELECT: all authenticated users in same org
-- INSERT/UPDATE/DELETE: admin/manager in same org ONLY
-- No broad same-org write policies (permissive policies are OR'd)
-- ============================================================

CREATE POLICY dealer_nexus_states_select_same_org
    ON dealer_nexus_states FOR SELECT
    USING (organization_id = get_user_org_id());

CREATE POLICY dealer_nexus_states_insert_admin
    ON dealer_nexus_states FOR INSERT
    WITH CHECK (
        organization_id = get_user_org_id()
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'manager')
        )
    );

CREATE POLICY dealer_nexus_states_update_admin
    ON dealer_nexus_states FOR UPDATE
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

CREATE POLICY dealer_nexus_states_delete_admin
    ON dealer_nexus_states FOR DELETE
    USING (
        organization_id = get_user_org_id()
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'manager')
        )
    );

-- ============================================================
-- Seed: Electronic Life KS nexus row ONLY (no MO)
-- ============================================================

INSERT INTO dealer_nexus_states (
    organization_id, state, nexus_status, nexus_type,
    registration_date, determination_date, determination_notes,
    source, mjv_baseline_date, effective_from, effective_through, is_current
)
VALUES
    (
        'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15',
        'KS',
        'yes',
        NULL,
        NULL,
        NULL,
        'Migrated from legacy company_settings.nexus_states array. KS confirmed as home/jurisdiction state (default_jurisdiction_state = ''KS''). MO also present in legacy array but not seeded pending confirmation.',
        'migrated_legacy',
        CURRENT_DATE,
        NULL,
        NULL,
        true
    );
