/*
# Phase 2 Test: B - Delete generated task then change labor

Delete the proposal_task for item B, then update labor_hours on item B.
Expected: task does NOT reappear, tasks_seeded_at stays set.
*/

-- Step 1: Delete the generated task for item B
DELETE FROM proposal_tasks WHERE line_item_id = '4f669f37-9f15-4977-954d-de3c28cf6775';

-- Step 2: Change labor_hours on item B (4 -> 8)
UPDATE proposal_line_items
SET labor_hours = 8
WHERE id = '4f669f37-9f15-4977-954d-de3c28cf6775';
