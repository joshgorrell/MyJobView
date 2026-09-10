/*
# Stage B2: Missouri Existing-Rule Import as PENDING/INACTIVE

## Purpose
Imports the EXISTING Missouri tax rules from the TypeScript `MO_RULES` function in
`src/lib/taxCalculations.ts` (lines 120-155) into the `state_tax_rules_matrix` table.

These rules are NOT approved for production use. They are imported from the existing
codebase for architectural/testing purposes only. Missouri rules remain PENDING REVIEW
until explicitly approved.

## What Is Migrated
For each of the 10 Missouri scenarios, two rows are inserted:
  1. One row targeting the Material classification with is_taxable = partsTaxable
  2. One row targeting the Labor classification with is_taxable = laborTaxable

Total: 20 rows for Missouri.

ALL Missouri rows are marked is_active = false (PENDING REVIEW).

## Missouri Scenarios (from MO_RULES)

| # | Environment     | Project Type                  | Parts Taxable | Labor Taxable |
|---|-----------------|-------------------------------|---------------|---------------|
| 1 | (any)           | exempt_project                | false         | false         |
| 2 | (any)           | design_services               | false         | false         |
| 3 | (any)           | security_monitoring           | false         | false         |
| 4 | (any)           | maintenance_agreement         | true          | true          |
| 5 | (any)           | membership                    | true          | true          |
| 6 | (any)           | original_construction         | true          | false         |
| 7 | (any)           | remodel                       | true          | false         |
| 8 | (any)           | general_installation_repair   | true          | true          |

Note: MO_RULES does not distinguish environment for most scenarios. The function checks
projectType first (before environment) for scenarios 1-5 and 8. For original_construction
and remodel, the explanation text includes the environment but the taxability result is
the same for both environments. We use environment = 'both' for all Missouri scenarios
since the (partsTaxable, laborTaxable) result is identical regardless of environment.

## Missouri vs Kansas Key Differences
- Missouri original_construction: labor exempt for BOTH environments (Kansas: same)
- Missouri remodel: labor exempt for BOTH environments (Kansas: residential exempt, commercial taxable)
- Missouri default fallback: parts taxable, labor exempt (Kansas: both taxable)

## Effective Date Documentation
- effective_from = '2026-09-10' — MJV matrix baseline date, NOT statutory effective date
- statutory_effective_date = NULL — do not guess
- migrated_at = now() (automatic)

## What Is NOT Migrated
- No rows for Design Fee, Project Management, Freight/Delivery, Credit Card Fee, or Custom Modifiers
- No rows are marked is_active = true

## Security
No RLS changes — existing matrix RLS covers the new rows.

## Important Notes
1. ALL Missouri rows are is_active = false — PENDING REVIEW
2. No production tax calculations are changed
3. Missouri rules must NOT become an approved production ruleset without explicit approval
*/

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
  NULL,
  v.is_taxable,
  v.explanation,
  '2026-09-10'::date,  -- MJV matrix baseline date, NOT statutory effective date
  NULL,                 -- statutory_effective_date unknown
  1,                    -- rule_version 1 = initial matrix baseline
  false                 -- is_active = false — PENDING REVIEW
FROM (VALUES
  -- Scenario 1: exempt_project (both environments)
  ('MO', 'both', 'exempt_project', 'c2040fe0-9519-46fe-bf39-bee25cd48c49'::uuid, false, 'Exempt projects — no tax. Mo. Rev. Stat. § 144.030.'),
  ('MO', 'both', 'exempt_project', '3835bce4-e922-47fc-9532-24a5239595c8'::uuid, false, 'Exempt projects — no tax. Mo. Rev. Stat. § 144.030.'),

  -- Scenario 2: design_services (both environments)
  ('MO', 'both', 'design_services', 'c2040fe0-9519-46fe-bf39-bee25cd48c49'::uuid, false, 'Design services are non-taxable in Missouri. Mo. Rev. Stat. § 144.020.'),
  ('MO', 'both', 'design_services', '3835bce4-e922-47fc-9532-24a5239595c8'::uuid, false, 'Design services are non-taxable in Missouri. Mo. Rev. Stat. § 144.020.'),

  -- Scenario 3: security_monitoring (both environments)
  ('MO', 'both', 'security_monitoring', 'c2040fe0-9519-46fe-bf39-bee25cd48c49'::uuid, false, 'Security monitoring services are not taxable in Missouri.'),
  ('MO', 'both', 'security_monitoring', '3835bce4-e922-47fc-9532-24a5239595c8'::uuid, false, 'Security monitoring services are not taxable in Missouri.'),

  -- Scenario 4: maintenance_agreement (both environments)
  ('MO', 'both', 'maintenance_agreement', 'c2040fe0-9519-46fe-bf39-bee25cd48c49'::uuid, true, 'Maintenance agreements and memberships are taxable in Missouri. Mo. Rev. Stat. § 144.020.'),
  ('MO', 'both', 'maintenance_agreement', '3835bce4-e922-47fc-9532-24a5239595c8'::uuid, true, 'Maintenance agreements and memberships are taxable in Missouri. Mo. Rev. Stat. § 144.020.'),

  -- Scenario 5: membership (both environments)
  ('MO', 'both', 'membership', 'c2040fe0-9519-46fe-bf39-bee25cd48c49'::uuid, true, 'Maintenance agreements and memberships are taxable in Missouri. Mo. Rev. Stat. § 144.020.'),
  ('MO', 'both', 'membership', '3835bce4-e922-47fc-9532-24a5239595c8'::uuid, true, 'Maintenance agreements and memberships are taxable in Missouri. Mo. Rev. Stat. § 144.020.'),

  -- Scenario 6: original_construction (both environments — MO doesn't distinguish)
  ('MO', 'both', 'original_construction', 'c2040fe0-9519-46fe-bf39-bee25cd48c49'::uuid, true, 'Parts taxable, separately-stated labor exempt — original construction. Mo. Rev. Stat. § 144.062.'),
  ('MO', 'both', 'original_construction', '3835bce4-e922-47fc-9532-24a5239595c8'::uuid, false, 'Parts taxable, separately-stated labor exempt — original construction. Mo. Rev. Stat. § 144.062.'),

  -- Scenario 7: remodel (both environments — MO doesn't distinguish)
  ('MO', 'both', 'remodel', 'c2040fe0-9519-46fe-bf39-bee25cd48c49'::uuid, true, 'Parts taxable, separately-stated labor exempt — remodel. Mo. Rev. Stat. § 144.062.'),
  ('MO', 'both', 'remodel', '3835bce4-e922-47fc-9532-24a5239595c8'::uuid, false, 'Parts taxable, separately-stated labor exempt — remodel. Mo. Rev. Stat. § 144.062.'),

  -- Scenario 8: general_installation_repair (both environments)
  ('MO', 'both', 'general_installation_repair', 'c2040fe0-9519-46fe-bf39-bee25cd48c49'::uuid, true, 'Both parts and labor taxable — general installation/repair (lump-sum retail). Mo. Rev. Stat. § 144.020.'),
  ('MO', 'both', 'general_installation_repair', '3835bce4-e922-47fc-9532-24a5239595c8'::uuid, true, 'Both parts and labor taxable — general installation/repair (lump-sum retail). Mo. Rev. Stat. § 144.020.')
) AS v(state, environment, project_type, tax_classification_id, is_taxable, explanation)
WHERE NOT EXISTS (
  SELECT 1 FROM state_tax_rules_matrix s
  WHERE s.organization_id = 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15'
    AND s.state = v.state
    AND s.environment = v.environment
    AND s.project_type = v.project_type
    AND s.tax_classification_id = v.tax_classification_id
);
