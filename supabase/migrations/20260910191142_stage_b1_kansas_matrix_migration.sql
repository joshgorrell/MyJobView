/*
# Stage B1: Kansas State Tax Rules Matrix Migration

## Purpose
Migrates the EXISTING APPROVED Kansas tax rules from the TypeScript `KS_RULES` function
in `src/lib/taxCalculations.ts` (lines 83-118) into the `state_tax_rules_matrix` table.

These rules are NOT new. They are the same rules MJV uses today in production. We are
centralizing them into the matrix, not creating or changing any Kansas tax rule.

## Source of Truth
The approved `KS_RULES` function is the authoritative starting point. Every (environment,
projectType) combination and its (partsTaxable, laborTaxable) result is mapped exactly
as written in the TypeScript code.

## What Is Migrated
For each of the 10 Kansas scenarios, two rows are inserted:
  1. One row targeting the Material classification (tax_classification_id = Material)
     with is_taxable = partsTaxable from KS_RULES
  2. One row targeting the Labor classification (tax_classification_id = Labor)
     with is_taxable = laborTaxable from KS_RULES

Total: 20 rows for Kansas.

## Kansas Scenarios (from KS_RULES)

| # | Environment     | Project Type                  | Parts Taxable | Labor Taxable |
|---|-----------------|-------------------------------|---------------|---------------|
| 1 | (any)           | exempt_project                | false         | false         |
| 2 | (any)           | design_services               | false         | false         |
| 3 | (any)           | security_monitoring           | false         | false         |
| 4 | (any)           | maintenance_agreement         | true          | true          |
| 5 | (any)           | membership                    | true          | true          |
| 6 | residential      | original_construction         | true          | false         |
| 7 | residential      | remodel                       | true          | false         |
| 8 | commercial       | original_construction         | true          | false         |
| 9 | commercial       | remodel                       | true          | true          |
| 10| (any)           | general_installation_repair   | true          | true         |

Note: KS_RULES does not distinguish environment for scenarios 1-5 and 10. The function
checks projectType first (before environment), so these apply to BOTH environments.
For the matrix, we insert rows with environment = 'both' for these scenarios.

## Effective Date Documentation
- `effective_from` = '2026-09-10' — this is the **MJV matrix baseline date**, NOT a claim
  about the statutory effective date of any Kansas tax law. It documents when this rule
  became active in the centralized MJV matrix system.
- `statutory_effective_date` = NULL — we do not guess historical statutory effective dates
- `migrated_at` = now() (automatic) — records when this row was imported into the matrix

## What Is NOT Migrated
- No rows for Design Fee classification
- No rows for Project Management classification
- No rows for Freight/Delivery special charge
- No rows for Credit Card Fee special charge
- No Custom Modifier classifications
These gaps are documented in the B3 Classification-Gap Report.

## Security
No RLS changes — existing matrix RLS covers the new rows.

## Important Notes
1. All Kansas rows are is_active = true (these are the approved production rules)
2. rule_version = 1 (initial matrix version)
3. No production tax calculations are changed — this is data migration only
4. The explanation text is copied exactly from KS_RULES.getApplicability()
*/

-- Classification IDs (verified):
-- Material: c2040fe0-9519-46fe-bf39-bee25cd48c49
-- Labor:    3835bce4-e922-47fc-9532-24a5239595c8

INSERT INTO state_tax_rules_matrix (
  organization_id, state, environment, project_type,
  tax_classification_id, special_charge_classification_id,
  is_taxable, explanation,
  effective_from, statutory_effective_date, rule_version, is_active
)
SELECT
  'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15',
  v.state,
  v.environment,
  v.project_type,
  v.tax_classification_id,
  NULL, -- special_charge_classification_id always NULL for Material/Labor rules
  v.is_taxable,
  v.explanation,
  '2026-09-10'::date,  -- MJV matrix baseline date, NOT statutory effective date
  NULL,                 -- statutory_effective_date unknown — do not guess
  1,                    -- rule_version 1 = initial matrix baseline
  true                  -- is_active = true for approved Kansas rules
FROM (VALUES
  -- Scenario 1: exempt_project (both environments)
  ('KS', 'both', 'exempt_project', 'c2040fe0-9519-46fe-bf39-bee25cd48c49'::uuid, false, 'Exempt projects are not taxed (parts or labor). K.S.A. 79-3606.'),
  ('KS', 'both', 'exempt_project', '3835bce4-e922-47fc-9532-24a5239595c8'::uuid, false, 'Exempt projects are not taxed (parts or labor). K.S.A. 79-3606.'),

  -- Scenario 2: design_services (both environments)
  ('KS', 'both', 'design_services', 'c2040fe0-9519-46fe-bf39-bee25cd48c49'::uuid, false, 'Design services are non-taxable under Kansas law.'),
  ('KS', 'both', 'design_services', '3835bce4-e922-47fc-9532-24a5239595c8'::uuid, false, 'Design services are non-taxable under Kansas law.'),

  -- Scenario 3: security_monitoring (both environments)
  ('KS', 'both', 'security_monitoring', 'c2040fe0-9519-46fe-bf39-bee25cd48c49'::uuid, false, 'Security monitoring is non-taxable (taxed only on recurring invoices).'),
  ('KS', 'both', 'security_monitoring', '3835bce4-e922-47fc-9532-24a5239595c8'::uuid, false, 'Security monitoring is non-taxable (taxed only on recurring invoices).'),

  -- Scenario 4: maintenance_agreement (both environments)
  ('KS', 'both', 'maintenance_agreement', 'c2040fe0-9519-46fe-bf39-bee25cd48c49'::uuid, true, 'Both parts and labor are taxable for maintenance agreements and memberships. K.S.A. 79-3603.'),
  ('KS', 'both', 'maintenance_agreement', '3835bce4-e922-47fc-9532-24a5239595c8'::uuid, true, 'Both parts and labor are taxable for maintenance agreements and memberships. K.S.A. 79-3603.'),

  -- Scenario 5: membership (both environments)
  ('KS', 'both', 'membership', 'c2040fe0-9519-46fe-bf39-bee25cd48c49'::uuid, true, 'Both parts and labor are taxable for maintenance agreements and memberships. K.S.A. 79-3603.'),
  ('KS', 'both', 'membership', '3835bce4-e922-47fc-9532-24a5239595c8'::uuid, true, 'Both parts and labor are taxable for maintenance agreements and memberships. K.S.A. 79-3603.'),

  -- Scenario 6: residential original_construction
  ('KS', 'residential', 'original_construction', 'c2040fe0-9519-46fe-bf39-bee25cd48c49'::uuid, true, 'Parts taxable, labor exempt — residential original construction. K.S.A. 79-3603(p).'),
  ('KS', 'residential', 'original_construction', '3835bce4-e922-47fc-9532-24a5239595c8'::uuid, false, 'Parts taxable, labor exempt — residential original construction. K.S.A. 79-3603(p).'),

  -- Scenario 7: residential remodel
  ('KS', 'residential', 'remodel', 'c2040fe0-9519-46fe-bf39-bee25cd48c49'::uuid, true, 'Parts taxable, labor exempt — residential remodel. K.S.A. 79-3603.'),
  ('KS', 'residential', 'remodel', '3835bce4-e922-47fc-9532-24a5239595c8'::uuid, false, 'Parts taxable, labor exempt — residential remodel. K.S.A. 79-3603.'),

  -- Scenario 8: commercial original_construction
  ('KS', 'commercial', 'original_construction', 'c2040fe0-9519-46fe-bf39-bee25cd48c49'::uuid, true, 'Parts taxable, labor exempt — commercial original construction. K.S.A. 79-3603(p).'),
  ('KS', 'commercial', 'original_construction', '3835bce4-e922-47fc-9532-24a5239595c8'::uuid, false, 'Parts taxable, labor exempt — commercial original construction. K.S.A. 79-3603(p).'),

  -- Scenario 9: commercial remodel
  ('KS', 'commercial', 'remodel', 'c2040fe0-9519-46fe-bf39-bee25cd48c49'::uuid, true, 'Both parts and labor taxable — commercial remodel. K.S.A. 79-3603.'),
  ('KS', 'commercial', 'remodel', '3835bce4-e922-47fc-9532-24a5239595c8'::uuid, true, 'Both parts and labor taxable — commercial remodel. K.S.A. 79-3603.'),

  -- Scenario 10: general_installation_repair (both environments)
  ('KS', 'both', 'general_installation_repair', 'c2040fe0-9519-46fe-bf39-bee25cd48c49'::uuid, true, 'Both parts and labor taxable — general installation/repair/retail. K.S.A. 79-3603.'),
  ('KS', 'both', 'general_installation_repair', '3835bce4-e922-47fc-9532-24a5239595c8'::uuid, true, 'Both parts and labor taxable — general installation/repair/retail. K.S.A. 79-3603.')
) AS v(state, environment, project_type, tax_classification_id, is_taxable, explanation)
WHERE NOT EXISTS (
  SELECT 1 FROM state_tax_rules_matrix s
  WHERE s.organization_id = 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15'
    AND s.state = v.state
    AND s.environment = v.environment
    AND s.project_type = v.project_type
    AND s.tax_classification_id = v.tax_classification_id
);
