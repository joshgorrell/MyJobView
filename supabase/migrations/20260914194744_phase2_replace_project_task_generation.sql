/*
# Phase 2: Replace Project Task Generation and Drop Sales Order Trigger

## Purpose
1. Replace generate_project_tasks_on_project_creation() to copy from proposal_tasks
   instead of generating from labor phases/task_notes
2. Drop the redundant generate_project_tasks_on_sales_order trigger (wrong event point)

## What Changed

### generate_project_tasks_on_project_creation()
New logic:
- Looks up the proposal via sales_orders.proposal_id from NEW.sales_order_id
- Iterates through proposal_tasks for that proposal (NOT labor phases)
- For each proposal_task, checks if a project_tasks row already exists with
  (project_id = NEW.id, source_proposal_task_id = proposal_task.id)
- If not, inserts one project_task:
  - title, description, labor_phase_id, sort_order from the proposal_task
  - source = 'proposal', visibility = 'internal'
  - source_line_item_id from proposal_tasks.line_item_id
  - source_proposal_task_id from proposal_tasks.id
  - estimated_hours uses schema default (0)
- Idempotency: unique partial index guarantees each proposal task copied at most once
- Manual project tasks (NULL source_proposal_task_id) never block generation

### Dropped: generate_project_tasks_on_sales_order trigger
The trigger on sales_orders AFTER INSERT was the wrong event point:
- Project may not exist yet when sales order is created
- Would be redundant with the project creation trigger
- Dropped trigger and the generate_project_tasks_from_proposal() function

## Security
- Function is SECURITY DEFINER (runs in trigger context)
- No RLS changes

## Important Notes
1. Existing 20 project tasks are NOT touched (they have NULL source_proposal_task_id)
2. The unique partial index on (project_id, source_proposal_task_id) provides idempotency
3. estimated_hours defaults to 0 (schema default preserved, not set to NULL)
*/

-- Replace the project creation trigger function
CREATE OR REPLACE FUNCTION generate_project_tasks_on_project_creation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proposal_id   uuid;
  v_task          record;
  v_sort_order    integer := 0;
BEGIN
  -- Only process if this project came from a sales order
  IF NEW.sales_order_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get the proposal from the sales order
  SELECT so.proposal_id INTO v_proposal_id
  FROM sales_orders so
  WHERE so.id = NEW.sales_order_id
  LIMIT 1;

  IF v_proposal_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Copy surviving proposal tasks to project tasks
  FOR v_task IN
    SELECT
      pt.id             AS proposal_task_id,
      pt.title,
      pt.description,
      pt.labor_phase_id,
      pt.line_item_id,
      pt.sort_order
    FROM proposal_tasks pt
    WHERE pt.proposal_id = v_proposal_id
    ORDER BY pt.sort_order
  LOOP
    -- Check if this proposal task was already copied (idempotency)
    IF NOT EXISTS (
      SELECT 1 FROM project_tasks
      WHERE project_id = NEW.id
        AND source_proposal_task_id = v_task.proposal_task_id
    ) THEN
      INSERT INTO project_tasks (
        project_id, organization_id,
        title, description, labor_phase_id,
        status, sort_order,
        source_line_item_id, source_proposal_task_id,
        source, visibility,
        created_by, created_at, updated_at
      ) VALUES (
        NEW.id, NEW.organization_id,
        v_task.title, v_task.description, v_task.labor_phase_id,
        'open', v_task.sort_order,
        v_task.line_item_id, v_task.proposal_task_id,
        'proposal', 'internal',
        NEW.created_by, now(), now()
      );
      v_sort_order := v_sort_order + 1;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

-- Drop the redundant sales order trigger and function
DROP TRIGGER IF EXISTS generate_project_tasks_on_sales_order ON sales_orders;
DROP FUNCTION IF EXISTS generate_project_tasks_from_proposal();
