/*
  # Change show_task_notes Default to False

  1. Changes
    - Change default value of `show_task_notes` column in `proposal_line_items` from true to false
    - Task notes will now be hidden on customer-facing proposals by default

  2. Purpose
    - Task notes are primarily for internal technician use
    - Users can explicitly opt-in to show them on proposals when needed
    - Better default behavior for customer-facing documents
*/

-- Change the default value to false
ALTER TABLE proposal_line_items
  ALTER COLUMN show_task_notes SET DEFAULT false;
