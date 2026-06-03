/*
  # Add requested_at timestamp to punchlist_tasks

  ## Summary
  Adds a dedicated `requested_at` column to `punchlist_tasks` so we can track the exact
  moment a customer submits ("requests") a task for service, independently of `updated_at`.

  This allows staff to measure how long a customer held onto a task in draft status before
  requesting it — the gap between `created_at` and `requested_at`.

  ## Changes
  1. New column: `requested_at` (timestamptz, nullable) on `punchlist_tasks`
  2. Backfill: For tasks already in requested, scheduled, or completed status, set
     `requested_at = updated_at` as a best-effort estimate of when the request was made.

  ## Notes
  - Column is nullable — draft tasks and tasks created before this migration will have NULL
  - The `request_punchlist_service` function is updated separately to populate this column
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'punchlist_tasks' AND column_name = 'requested_at'
  ) THEN
    ALTER TABLE punchlist_tasks ADD COLUMN requested_at timestamptz;
  END IF;
END $$;

-- Backfill best-effort: use updated_at for tasks that are already past draft
UPDATE punchlist_tasks
SET requested_at = updated_at
WHERE status IN ('requested', 'scheduled', 'completed')
  AND requested_at IS NULL;
