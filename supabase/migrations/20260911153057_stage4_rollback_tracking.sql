/*
 * Stage 4: Rollback tracking table
 *
 * Captures the IDs of all rows inserted by Stage 4 so that
 * row-level rollback can remove exactly those rows later.
 *
 * Total expected: 9 rows (1 nexus + 8 modifier defaults)
 */

CREATE TABLE IF NOT EXISTS _stage4_rollback_ids (
    table_name text NOT NULL,
    row_id uuid NOT NULL,
    PRIMARY KEY (table_name, row_id)
);

-- Capture all dealer_nexus_states rows inserted by Stage 4
INSERT INTO _stage4_rollback_ids (table_name, row_id)
SELECT 'dealer_nexus_states', id
FROM dealer_nexus_states
WHERE organization_id = 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15';

-- Capture all dealer_modifier_defaults rows inserted by Stage 4
INSERT INTO _stage4_rollback_ids (table_name, row_id)
SELECT 'dealer_modifier_defaults', id
FROM dealer_modifier_defaults
WHERE organization_id = 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15';
