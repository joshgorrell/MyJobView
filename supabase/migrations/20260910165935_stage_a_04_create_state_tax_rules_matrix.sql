/*
# Stage A.4: Create state_tax_rules_matrix Table

## Purpose
Creates the `state_tax_rules_matrix` table that will hold per-state taxability rules for each
combination of environment, project type, and classification. This is the table the future
central tax engine will query to determine whether a given classification (Material, Labor,
Design Fee, Project Management) or special charge (Freight/Delivery, Credit Card Fee) is taxable
for a specific state + environment + project type scenario.

## New Table: state_tax_rules_matrix
- `id` (uuid, PK)
- `organization_id` (uuid, defaults to get_user_org_id())
- `state` (char(2) — US state code, e.g. 'KS', 'MO')
- `environment` (text — 'residential', 'commercial', or 'both')
- `project_type` (text — e.g. 'original_construction', 'remodel', 'general_installation_repair', etc.)
- `tax_classification_id` (uuid, nullable FK to tax_classifications)
- `special_charge_classification_id` (uuid, nullable FK to special_charge_classifications)
- `is_taxable` (boolean)
- `explanation` (text — human-readable explanation of the rule)
- `effective_from` (date — when this rule takes effect)
- `effective_through` (date, nullable — when this rule expires, NULL = open-ended)
- `rule_version` (integer, default 1)
- `is_active` (boolean, default true)
- `created_at` (timestamptz, default now())
- `updated_at` (timestamptz, default now())

## Constraint Design (Critical)

### Either/Or CHECK Constraint
A rule must target EXACTLY ONE of:
  - a normal tax classification (tax_classification_id IS NOT NULL), OR
  - a special charge classification (special_charge_classification_id IS NOT NULL)

It cannot target both, and it cannot target neither. This prevents ambiguity:

  CHECK (
    (tax_classification_id IS NOT NULL AND special_charge_classification_id IS NULL)
    OR
    (tax_classification_id IS NULL AND special_charge_classification_id IS NOT NULL)
  )

### Unique Index
Prevents duplicate effective rules for the same scenario + classification + effective date.
Uses COALESCE to handle NULL FKs in the uniqueness check so that a NULL uuid does not collide
with another NULL in a different classification type:

  UNIQUE INDEX ON (
    organization_id, state, environment, project_type,
    COALESCE(tax_classification_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(special_charge_classification_id, '00000000-0000-0000-0000-000000000000'::uuid),
    effective_from
  )

This ensures only one rule per (org, state, environment, project_type, classification, effective_from)
regardless of whether it targets a normal classification or a special charge.

## Security
- RLS enabled
- SELECT: authenticated users in same org
- INSERT/UPDATE/DELETE: authenticated users in same org

## Important Notes
1. No rows are inserted in this migration — Kansas/Missouri rules will be loaded in a later stage
2. No production tax calculations are changed
3. The either/or constraint ensures every rule unambiguously targets one classification type
*/

CREATE TABLE IF NOT EXISTS state_tax_rules_matrix (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid DEFAULT get_user_org_id(),
  state char(2) NOT NULL,
  environment text NOT NULL,
  project_type text NOT NULL,
  tax_classification_id uuid,
  special_charge_classification_id uuid,
  is_taxable boolean NOT NULL,
  explanation text,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_through date,
  rule_version integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Either/or constraint: exactly one classification type must be set
  CONSTRAINT state_tax_rules_either_or CHECK (
    (tax_classification_id IS NOT NULL AND special_charge_classification_id IS NULL)
    OR
    (tax_classification_id IS NULL AND special_charge_classification_id IS NOT NULL)
  ),
  -- FK constraints
  CONSTRAINT state_tax_rules_classification_fk
    FOREIGN KEY (tax_classification_id) REFERENCES tax_classifications(id) ON DELETE CASCADE,
  CONSTRAINT state_tax_rules_special_charge_fk
    FOREIGN KEY (special_charge_classification_id) REFERENCES special_charge_classifications(id) ON DELETE CASCADE
);

-- Unique index to prevent duplicate rules for the same scenario + classification + effective date
CREATE UNIQUE INDEX IF NOT EXISTS state_tax_rules_matrix_unique_idx
  ON state_tax_rules_matrix (
    organization_id,
    state,
    environment,
    project_type,
    COALESCE(tax_classification_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(special_charge_classification_id, '00000000-0000-0000-0000-000000000000'::uuid),
    effective_from
  );

-- Index for common query pattern: lookup by state + environment + project type
CREATE INDEX IF NOT EXISTS state_tax_rules_matrix_lookup_idx
  ON state_tax_rules_matrix (organization_id, state, environment, project_type, is_active);

ALTER TABLE state_tax_rules_matrix ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "state_tax_rules_select_same_org" ON state_tax_rules_matrix;
CREATE POLICY "state_tax_rules_select_same_org"
  ON state_tax_rules_matrix FOR SELECT
  TO authenticated
  USING (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "state_tax_rules_insert_same_org" ON state_tax_rules_matrix;
CREATE POLICY "state_tax_rules_insert_same_org"
  ON state_tax_rules_matrix FOR INSERT
  TO authenticated
  WITH CHECK (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "state_tax_rules_update_same_org" ON state_tax_rules_matrix;
CREATE POLICY "state_tax_rules_update_same_org"
  ON state_tax_rules_matrix FOR UPDATE
  TO authenticated
  USING (organization_id = get_user_org_id())
  WITH CHECK (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "state_tax_rules_delete_same_org" ON state_tax_rules_matrix;
CREATE POLICY "state_tax_rules_delete_same_org"
  ON state_tax_rules_matrix FOR DELETE
  TO authenticated
  USING (organization_id = get_user_org_id());
