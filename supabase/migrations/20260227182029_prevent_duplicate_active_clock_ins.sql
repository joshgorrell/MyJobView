/*
  # Prevent Duplicate Active Clock-In Entries

  ## Problem
  A user could have multiple simultaneous active (status = 'clocked_in') entries in
  daily_clock_entries. This caused UI confusion (same user appearing "clocked in twice")
  and was triggered by the auto clock-out cron bug failing to close open entries.

  ## Changes

  1. **Partial unique index**: Creates a unique constraint on (technician_id) WHERE status = 'clocked_in'
     This is a partial index — it only enforces uniqueness among rows where status = 'clocked_in',
     so a user can have multiple completed (clocked_out) entries but only one active one at a time.

  2. **Cleanup existing violations**: Before adding the constraint, close any duplicate active entries
     by keeping the most recent clock_in and auto-closing the older ones.

  ## Security
  No RLS changes needed — this is a data integrity constraint at the database level.
*/

-- Step 1: Close any remaining duplicate active clock-in entries (keep the newest per user)
-- Set older duplicates to clocked_out with a note
WITH ranked_active AS (
  SELECT 
    id,
    technician_id,
    clock_in,
    ROW_NUMBER() OVER (PARTITION BY technician_id ORDER BY clock_in DESC) AS rn
  FROM daily_clock_entries
  WHERE status = 'clocked_in'
    AND clock_out IS NULL
    AND auto_clocked_out = false
),
duplicates AS (
  SELECT id FROM ranked_active WHERE rn > 1
)
UPDATE daily_clock_entries
SET 
  clock_out = NOW() - interval '1 second',
  status = 'clocked_out',
  total_hours = GREATEST(0, EXTRACT(EPOCH FROM (NOW() - interval '1 second' - clock_in)) / 3600),
  auto_clocked_out = true,
  auto_clocked_out_at = NOW(),
  notes = COALESCE(notes || E'\n', '') || 'Duplicate active entry — closed automatically to enforce single active clock-in constraint.'
WHERE id IN (SELECT id FROM duplicates);

-- Step 2: Create partial unique index to prevent future duplicates
-- Only one row per technician can have status = 'clocked_in' at a time
CREATE UNIQUE INDEX IF NOT EXISTS daily_clock_entries_single_active_per_tech
  ON daily_clock_entries (technician_id)
  WHERE (status = 'clocked_in');
