/*
# Cleanup: Remove dealer override test data

## Purpose
Remove the temporary test rows created for the dealer-override precedence
tests. This deletes:

1. The two test override rows from state_tax_rules_matrix.
2. The two test tax_classifications for the test org.
3. The test organization (Test Dealer B).

This is safe because all test rows were marked with
'TEST OVERRIDE - DELETE AFTER TESTING' in their explanation field, and the
test org was created solely for isolation testing.
*/

-- ── 1. Delete test override rows from state_tax_rules_matrix ─────────
DELETE FROM state_tax_rules_matrix
WHERE id IN (
  'aaaa1111-0000-0000-0000-000000000001',
  'aaaa1111-0000-0000-0000-000000000002'
);

-- ── 2. Delete test tax_classifications ───────────────────────────────
DELETE FROM tax_classifications
WHERE id IN (
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333'
);

-- ── 3. Delete test organization ─────────────────────────────────────
DELETE FROM organizations
WHERE id = '11111111-1111-1111-1111-111111111111';