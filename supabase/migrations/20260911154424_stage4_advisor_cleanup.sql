/*
 * Stage 4 Advisor Cleanup
 *
 * 1. Add partial covering index for dealer_modifier_defaults.classification_id FK
 *    (column is normally NULL except for classified custom modifiers)
 *
 * 2. Fix auth_rls_initplan warnings on both Stage 4 tables by wrapping
 *    auth.uid() and get_user_org_id() calls in (select ...) subexpressions
 *    so Postgres evaluates them once per query (initplan) instead of per row.
 *
 * Access semantics are UNCHANGED:
 *   SELECT  = same organization (all authenticated users)
 *   INSERT  = admin/manager in same organization
 *   UPDATE  = admin/manager in same organization
 *   DELETE  = admin/manager in same organization
 */

-- 1. Partial covering index for classification_id FK
CREATE INDEX dealer_modifier_defaults_classification_idx
    ON dealer_modifier_defaults (classification_id)
    WHERE classification_id IS NOT NULL;

-- 2. Drop and recreate all RLS policies with initplan optimization
--    dealer_nexus_states: drop all 4 policies
DROP POLICY IF EXISTS dealer_nexus_states_select_same_org ON dealer_nexus_states;
DROP POLICY IF EXISTS dealer_nexus_states_insert_admin ON dealer_nexus_states;
DROP POLICY IF EXISTS dealer_nexus_states_update_admin ON dealer_nexus_states;
DROP POLICY IF EXISTS dealer_nexus_states_delete_admin ON dealer_nexus_states;

--    dealer_modifier_defaults: drop all 4 policies
DROP POLICY IF EXISTS dealer_modifier_defaults_select_same_org ON dealer_modifier_defaults;
DROP POLICY IF EXISTS dealer_modifier_defaults_insert_admin ON dealer_modifier_defaults;
DROP POLICY IF EXISTS dealer_modifier_defaults_update_admin ON dealer_modifier_defaults;
DROP POLICY IF EXISTS dealer_modifier_defaults_delete_admin ON dealer_modifier_defaults;

-- Recreate dealer_nexus_states policies with (select ...) initplan pattern
CREATE POLICY dealer_nexus_states_select_same_org
    ON dealer_nexus_states FOR SELECT
    USING (organization_id = (select get_user_org_id()));

CREATE POLICY dealer_nexus_states_insert_admin
    ON dealer_nexus_states FOR INSERT
    WITH CHECK (
        organization_id = (select get_user_org_id())
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (select auth.uid())
            AND profiles.role IN ('admin', 'manager')
        )
    );

CREATE POLICY dealer_nexus_states_update_admin
    ON dealer_nexus_states FOR UPDATE
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

CREATE POLICY dealer_nexus_states_delete_admin
    ON dealer_nexus_states FOR DELETE
    USING (
        organization_id = (select get_user_org_id())
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (select auth.uid())
            AND profiles.role IN ('admin', 'manager')
        )
    );

-- Recreate dealer_modifier_defaults policies with (select ...) initplan pattern
CREATE POLICY dealer_modifier_defaults_select_same_org
    ON dealer_modifier_defaults FOR SELECT
    USING (organization_id = (select get_user_org_id()));

CREATE POLICY dealer_modifier_defaults_insert_admin
    ON dealer_modifier_defaults FOR INSERT
    WITH CHECK (
        organization_id = (select get_user_org_id())
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (select auth.uid())
            AND profiles.role IN ('admin', 'manager')
        )
    );

CREATE POLICY dealer_modifier_defaults_update_admin
    ON dealer_modifier_defaults FOR UPDATE
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

CREATE POLICY dealer_modifier_defaults_delete_admin
    ON dealer_modifier_defaults FOR DELETE
    USING (
        organization_id = (select get_user_org_id())
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (select auth.uid())
            AND profiles.role IN ('admin', 'manager')
        )
    );
