/*
  # Add task_completed to proposal_line_items

  ## Summary
  Adds a boolean flag to track whether the task associated with a proposal line item
  has been completed in the field (during installation/service).

  ## Changes
  ### Modified Tables
  - `proposal_line_items`
    - `task_completed` (boolean, DEFAULT false) - marks whether a line item's associated
      task has been completed by a technician. Used to filter "remaining tasks" in the
      Labor Phase Report.

  ## Notes
  - Non-breaking: safe default of false means all existing rows behave as before
  - This is separate from work_order_task completion; it tracks completion at the
    proposal scope level so techs can use the Labor Phase Report to see what's left
    without needing a full work order workflow
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposal_line_items' AND column_name = 'task_completed'
  ) THEN
    ALTER TABLE proposal_line_items ADD COLUMN task_completed boolean DEFAULT false;
  END IF;
END $$;
