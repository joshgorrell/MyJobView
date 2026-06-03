/*
  # Add completed_by_customer tracking to punchlist_tasks

  ## Summary
  Customers can now mark their own punchlist tasks as complete from the portal.
  When they do, we track this separately so admins can distinguish customer
  self-completions from technician completions.

  ## Changes

  ### Modified Tables
  - `punchlist_tasks`
    - Added `completed_by_customer` (boolean, default false) — true when the
      customer marks the task complete themselves from the portal

  ### Modified Functions
  - `mark_punchlist_task_completed` — accepts a new `p_completed_by_customer`
    boolean parameter (default false) and stores it on the row
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'punchlist_tasks' AND column_name = 'completed_by_customer'
  ) THEN
    ALTER TABLE punchlist_tasks ADD COLUMN completed_by_customer boolean NOT NULL DEFAULT false;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.mark_punchlist_task_completed(
  p_task_id uuid,
  p_completed_by uuid DEFAULT NULL::uuid,
  p_completed_by_customer boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE punchlist_tasks
  SET
    status = 'completed',
    completed_at = now(),
    completed_by = COALESCE(p_completed_by, auth.uid()),
    completed_by_customer = p_completed_by_customer,
    updated_at = now()
  WHERE id = p_task_id;
END;
$$;
