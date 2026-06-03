/*
  # Add 'scheduled' status to punchlist_tasks

  ## Summary
  Adds a fourth status value 'scheduled' to the punchlist_tasks table, representing
  tasks that have been requested by the customer AND a work order has been created
  by staff (i.e., the service is actively scheduled).

  ## Changes
  ### Modified Tables
  - `punchlist_tasks` - Drops the old status check constraint and adds a new one that
    includes 'scheduled' as a valid value alongside 'draft', 'requested', and 'completed'.

  ## Status Flow
  1. draft      - Customer created, not yet submitted
  2. requested  - Customer submitted for service (service request created, no work order yet)
  3. scheduled  - Work order has been created; service is actively scheduled
  4. completed  - Task is done (marked by customer or staff)

  ## Notes
  - Existing data is unaffected; all current values (draft/requested/completed) remain valid.
  - A trigger will be added separately (or handled at app level) to auto-transition
    requested -> scheduled when a work_order_id is set on the linked service_request.
*/

DO $$
BEGIN
  -- Drop the old constraint if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'punchlist_tasks'
      AND constraint_type = 'CHECK'
      AND constraint_name LIKE '%punchlist_tasks_status%'
  ) THEN
    ALTER TABLE punchlist_tasks DROP CONSTRAINT punchlist_tasks_status_check;
  END IF;
END $$;

ALTER TABLE punchlist_tasks
  ADD CONSTRAINT punchlist_tasks_status_check
  CHECK (status IN ('draft', 'requested', 'scheduled', 'completed'));
