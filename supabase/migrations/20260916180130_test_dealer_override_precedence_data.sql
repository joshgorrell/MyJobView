/*
# Test data: Dealer override precedence tests

## Purpose
Create test data to verify the dealer-override precedence logic in
resolve_tax_rule.

1. Creates a second test organization (Test Dealer B) for isolation testing.
2. Creates tax_classifications for the test org (material, labor).
3. Inserts a dealer override for the EXISTING org (Electronic Life) that
   flips a master rule from taxable to non_taxable (Test A).
4. Inserts a dealer override for the EXISTING org that flips a master rule
   from non_taxable to taxable (Test B).

Test C and D use the second org (no overrides) to confirm it gets the master
rule and cannot see the first org's overrides.

## Cleanup
Test rows are marked with explanation = 'TEST OVERRIDE - DELETE AFTER TESTING'
so they can be cleaned up after verification.

## Security
- No RLS changes.
- No schema changes.
*/

-- ── 1. Create second test organization ───────────────────────────────
INSERT INTO organizations (id, name, slug)
VALUES ('11111111-1111-1111-1111-111111111111', 'Test Dealer B (Override Isolation Test)', 'test-dealer-b')
ON CONFLICT (id) DO NOTHING;

-- ── 2. Create tax_classifications for the test org ───────────────────
INSERT INTO tax_classifications (id, organization_id, code, label, classification_type, is_active, sort_order)
VALUES
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'material', 'Material', 'material', true, 1),
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'labor', 'Labor', 'labor', true, 2)
ON CONFLICT (organization_id, code) DO NOTHING;

-- ── 3. Test A: Master says taxable, dealer override says non_taxable ──
-- Master rule for KS + general_installation_repair + material = taxable
-- Insert dealer override for Electronic Life that says non_taxable
INSERT INTO state_tax_rules_matrix (
  id, organization_id, state, environment, project_type,
  tax_classification_id, taxability_status, explanation,
  effective_from, rule_version, is_active
)
VALUES (
  'aaaa1111-0000-0000-0000-000000000001',
  'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15',
  'KS', 'both', 'general_installation_repair',
  'c2040fe0-9519-46fe-bf39-bee25cd48c49',
  'non_taxable',
  'TEST OVERRIDE - DELETE AFTER TESTING: Master says taxable, dealer says non_taxable',
  CURRENT_DATE, 99, true
)
ON CONFLICT (id) DO NOTHING;

-- ── 4. Test B: Master says non_taxable, dealer override says taxable ──
-- Master rule for KS + design_services + material = non_taxable
-- Insert dealer override for Electronic Life that says taxable
INSERT INTO state_tax_rules_matrix (
  id, organization_id, state, environment, project_type,
  tax_classification_id, taxability_status, explanation,
  effective_from, rule_version, is_active
)
VALUES (
  'aaaa1111-0000-0000-0000-000000000002',
  'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15',
  'KS', 'both', 'design_services',
  'c2040fe0-9519-46fe-bf39-bee25cd48c49',
  'taxable',
  'TEST OVERRIDE - DELETE AFTER TESTING: Master says non_taxable, dealer says taxable',
  CURRENT_DATE, 99, true
)
ON CONFLICT (id) DO NOTHING;