/*
# Phase 2 Test Matrix Setup (temporary)

Creates a test proposal with 8 line items covering scenarios A-H.
The AFTER INSERT trigger on proposal_line_items will call
seed_proposal_tasks_for_line_item for each item.

Test IDs:
  proposal: 1ae71224-85c7-4c55-a918-8d247c4c825e
  room:     b1137c45-98e2-4927-a389-5a82e161fe41
  item A:   2a2611f7-1c01-4940-8022-7f8e49095233  (labor, no defaults)
  item B:   4f669f37-9f15-4977-954d-de3c28cf6775  (delete then change labor)
  item C:   5abfa710-5394-4380-b233-7b6a6fd71f87  (add labor later)
  item D:   f3dbca96-1fe1-4dad-a62f-ad420b3d090f  (multiple labor phases)
  item E:   35d48027-0a37-44c7-b699-cf1cbf8a6aec  (defaults + labor)
  item F:   cd570633-637b-410a-8038-86ee2855e632  (accessory with labor)
  item G:   48f65875-4e9b-406f-90be-370ce331da67  (accessory no labor)
  item H:   480b2d43-c17b-4cae-bf86-378d2eca0c80  (no labor + defaults)
*/

INSERT INTO proposals (
  id, company_id, contact_id, proposal_number, title, status, created_by,
  organization_id, is_revision, is_active_revision, revision_number,
  is_portal_visible, bill_to_send_to, tax_calculation_mode, tax_review_required
)
SELECT
  '1ae71224-85c7-4c55-a918-8d247c4c825e',
  '8affa764-8533-47ab-9fac-e8c6f2a5e86d',
  '627640fb-675b-4dc2-bfa3-779979ee64ee',
  'TEST-PHASE2-MATRIX',
  'Phase 2 Test Matrix',
  'designing',
  '024aeac6-bf64-4c44-9fba-d43996b02ca0',
  'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15',
  false, true, 1, false, 'customer', 'legacy', false
WHERE NOT EXISTS (SELECT 1 FROM proposals WHERE id = '1ae71224-85c7-4c55-a918-8d247c4c825e');

INSERT INTO proposal_rooms (id, proposal_id, name, sort_order, organization_id)
SELECT 'b1137c45-98e2-4927-a389-5a82e161fe41', '1ae71224-85c7-4c55-a918-8d247c4c825e', 'Test Room', 0, 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15'
WHERE NOT EXISTS (SELECT 1 FROM proposal_rooms WHERE id = 'b1137c45-98e2-4927-a389-5a82e161fe41');

-- A: Labor, no defaults
INSERT INTO proposal_line_items (id, proposal_id, room_id, description, quantity, unit_price, cost, line_total, organization_id, labor_hours, sort_order)
SELECT '2a2611f7-1c01-4940-8022-7f8e49095233', '1ae71224-85c7-4c55-a918-8d247c4c825e', 'b1137c45-98e2-4927-a389-5a82e161fe41', 'A-Labor-NoDefaults', 1, 100, 50, 100, 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15', 4, 0
WHERE NOT EXISTS (SELECT 1 FROM proposal_line_items WHERE id = '2a2611f7-1c01-4940-8022-7f8e49095233');

-- B: Delete then change labor
INSERT INTO proposal_line_items (id, proposal_id, room_id, description, quantity, unit_price, cost, line_total, organization_id, labor_hours, sort_order)
SELECT '4f669f37-9f15-4977-954d-de3c28cf6775', '1ae71224-85c7-4c55-a918-8d247c4c825e', 'b1137c45-98e2-4927-a389-5a82e161fe41', 'B-DeleteThenChangeLabor', 1, 100, 50, 100, 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15', 4, 1
WHERE NOT EXISTS (SELECT 1 FROM proposal_line_items WHERE id = '4f669f37-9f15-4977-954d-de3c28cf6775');

-- C: Add labor later (no labor initially)
INSERT INTO proposal_line_items (id, proposal_id, room_id, description, quantity, unit_price, cost, line_total, organization_id, sort_order)
SELECT '5abfa710-5394-4380-b233-7b6a6fd71f87', '1ae71224-85c7-4c55-a918-8d247c4c825e', 'b1137c45-98e2-4927-a389-5a82e161fe41', 'C-AddLaborLater', 1, 100, 50, 100, 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15', 2
WHERE NOT EXISTS (SELECT 1 FROM proposal_line_items WHERE id = '5abfa710-5394-4380-b233-7b6a6fd71f87');

-- D: Multiple labor phases
INSERT INTO proposal_line_items (id, proposal_id, room_id, description, quantity, unit_price, cost, line_total, organization_id, labor_hours, sort_order)
SELECT 'f3dbca96-1fe1-4dad-a62f-ad420b3d090f', '1ae71224-85c7-4c55-a918-8d247c4c825e', 'b1137c45-98e2-4927-a389-5a82e161fe41', 'D-MultipleLaborPhases', 1, 100, 50, 100, 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15', 4, 3
WHERE NOT EXISTS (SELECT 1 FROM proposal_line_items WHERE id = 'f3dbca96-1fe1-4dad-a62f-ad420b3d090f');

-- E: Defaults + labor
INSERT INTO proposal_line_items (id, proposal_id, room_id, product_id, description, quantity, unit_price, cost, line_total, organization_id, labor_hours, sort_order)
SELECT '35d48027-0a37-44c7-b699-cf1cbf8a6aec', '1ae71224-85c7-4c55-a918-8d247c4c825e', 'b1137c45-98e2-4927-a389-5a82e161fe41', '312d801e-6343-4213-b189-0af0fcec7404', 'E-DefaultsPlusLabor', 1, 500, 250, 500, 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15', 4, 4
WHERE NOT EXISTS (SELECT 1 FROM proposal_line_items WHERE id = '35d48027-0a37-44c7-b699-cf1cbf8a6aec');

-- F: Accessory with labor (child of E)
INSERT INTO proposal_line_items (id, proposal_id, room_id, description, quantity, unit_price, cost, line_total, organization_id, labor_hours, parent_item_id, sort_order)
SELECT 'cd570633-637b-410a-8038-86ee2855e632', '1ae71224-85c7-4c55-a918-8d247c4c825e', 'b1137c45-98e2-4927-a389-5a82e161fe41', 'F-AccessoryWithLabor', 1, 50, 25, 50, 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15', 4, '35d48027-0a37-44c7-b699-cf1cbf8a6aec', 5
WHERE NOT EXISTS (SELECT 1 FROM proposal_line_items WHERE id = 'cd570633-637b-410a-8038-86ee2855e632');

-- G: Accessory without labor or defaults (child of E)
INSERT INTO proposal_line_items (id, proposal_id, room_id, description, quantity, unit_price, cost, line_total, organization_id, parent_item_id, sort_order)
SELECT '48f65875-4e9b-406f-90be-370ce331da67', '1ae71224-85c7-4c55-a918-8d247c4c825e', 'b1137c45-98e2-4927-a389-5a82e161fe41', 'G-AccessoryNoLabor', 1, 50, 25, 50, 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15', '35d48027-0a37-44c7-b699-cf1cbf8a6aec', 6
WHERE NOT EXISTS (SELECT 1 FROM proposal_line_items WHERE id = '48f65875-4e9b-406f-90be-370ce331da67');

-- H: No labor + explicit defaults
INSERT INTO proposal_line_items (id, proposal_id, room_id, product_id, description, quantity, unit_price, cost, line_total, organization_id, sort_order)
SELECT '480b2d43-c17b-4cae-bf86-378d2eca0c80', '1ae71224-85c7-4c55-a918-8d247c4c825e', 'b1137c45-98e2-4927-a389-5a82e161fe41', '580e8c47-64c0-436d-8a2d-7a5ebb8b90de', 'H-NoLaborWithDefaults', 1, 500, 250, 500, 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15', 7
WHERE NOT EXISTS (SELECT 1 FROM proposal_line_items WHERE id = '480b2d43-c17b-4cae-bf86-378d2eca0c80');
