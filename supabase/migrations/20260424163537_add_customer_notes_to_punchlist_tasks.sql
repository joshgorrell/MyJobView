/*
  # Add customer_notes to punchlist_tasks

  ## Summary
  Adds a customer_notes column to punchlist_tasks so customers can append additional
  context after they have already submitted a service request (when the task is in
  "requested" status and editing the original details is no longer allowed).

  ## Changes
  - `punchlist_tasks.customer_notes` (text, nullable) — free-form text the customer
    can add/edit at any time after submission. Separate from `details` (original
    submission) so the original request is preserved for audit purposes.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'punchlist_tasks' AND column_name = 'customer_notes'
  ) THEN
    ALTER TABLE punchlist_tasks ADD COLUMN customer_notes text;
  END IF;
END $$;
