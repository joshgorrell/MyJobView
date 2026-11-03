/*
# Phase 2 Test: D - Add second labor phase to already-seeded item

Item D was seeded with 1 fallback task when inserted (labor_hours=4).
Now add two labor_phase entries. Expected: no NEW tasks created because
tasks_seeded_at is already set.
*/

INSERT INTO proposal_line_item_labor_phases (line_item_id, labor_phase_id, hours, sort_order, organization_id)
SELECT 'f3dbca96-1fe1-4dad-a62f-ad420b3d090f', 'b79a9a3a-3967-4bf2-afba-902679c05812', 2, 0, 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15'
WHERE NOT EXISTS (
  SELECT 1 FROM proposal_line_item_labor_phases
  WHERE line_item_id = 'f3dbca96-1fe1-4dad-a62f-ad420b3d090f'
    AND labor_phase_id = 'b79a9a3a-3967-4bf2-afba-902679c05812'
);

INSERT INTO proposal_line_item_labor_phases (line_item_id, labor_phase_id, hours, sort_order, organization_id)
SELECT 'f3dbca96-1fe1-4dad-a62f-ad420b3d090f', '4a4e35c2-3771-4b8c-90c7-e2c8cf9f4c9b', 2, 1, 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15'
WHERE NOT EXISTS (
  SELECT 1 FROM proposal_line_item_labor_phases
  WHERE line_item_id = 'f3dbca96-1fe1-4dad-a62f-ad420b3d090f'
    AND labor_phase_id = '4a4e35c2-3771-4b8c-90c7-e2c8cf9f4c9b'
);
