/*
# Phase 2 Test: C - Add labor later to unseeded item

Item C was inserted with no labor and no defaults (tasks_seeded_at = NULL).
Now we add a labor phase entry, which should trigger seeding.
*/

INSERT INTO proposal_line_item_labor_phases (line_item_id, labor_phase_id, hours, sort_order, organization_id)
SELECT '5abfa710-5394-4380-b233-7b6a6fd71f87', 'b79a9a3a-3967-4bf2-afba-902679c05812', 3, 0, 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15'
WHERE NOT EXISTS (
  SELECT 1 FROM proposal_line_item_labor_phases
  WHERE line_item_id = '5abfa710-5394-4380-b233-7b6a6fd71f87'
);
