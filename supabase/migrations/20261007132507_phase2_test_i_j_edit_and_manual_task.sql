/*
# Phase 2 Test: I - Salesperson edits wording + J - Manual General Task

I: Edit the title of item A's task to verify wording is independent.
J: Insert a manual General Task (line_item_id = NULL) directly into proposal_tasks.
*/

-- I: Edit the task title for item A
UPDATE proposal_tasks
SET title = 'A-EDITED-Custom Install Task',
    description = 'Salesperson customized this wording'
WHERE line_item_id = '2a2611f7-1c01-4940-8022-7f8e49095233';

-- J: Insert a manual General Task
INSERT INTO proposal_tasks (proposal_id, line_item_id, title, description, sort_order, organization_id, source_default_task_id)
SELECT '1ae71224-85c7-4c55-a918-8d247c4c825e', NULL, 'J-ManualGeneralTask', 'A manually added general task', 99, 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM proposal_tasks
  WHERE proposal_id = '1ae71224-85c7-4c55-a918-8d247c4c825e'
    AND title = 'J-ManualGeneralTask'
);
