/*
  # Fix punchlist_tasks status constraint to include 'requested'

  ## Problem
  The request_punchlist_service() function sets punchlist task status to 'requested'
  when a service request is created, but the status check constraint only allows:
  'draft', 'completed', 'scheduled', 'in_work_order'

  This causes the error: "new row for relation punchlist_tasks violates check constraint"

  ## Fix
  Add 'requested' to the allowed status values.
*/

ALTER TABLE punchlist_tasks DROP CONSTRAINT IF EXISTS punchlist_tasks_status_check;

ALTER TABLE punchlist_tasks
  ADD CONSTRAINT punchlist_tasks_status_check
  CHECK (status = ANY (ARRAY['draft'::text, 'completed'::text, 'scheduled'::text, 'in_work_order'::text, 'requested'::text]));
