/*
  # Add labor_phase_id to time_entries

  ## Summary
  Adds a nullable labor_phase_id column to the time_entries table so that
  project-level time entries (entry_type = 'project', work_order_id = null)
  can carry their own labor phase rather than inheriting it from a work order.

  ## Changes
  - `time_entries` — new nullable column `labor_phase_id` (uuid, FK to labor_phases)
  - Adds an index for join performance

  ## Notes
  - Existing rows are left as NULL (unassigned phase)
  - Work-order-backed entries still resolve phase via work_orders.labor_phase_id
  - Project-only entries (entry_type = 'project') use this column directly
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'time_entries' AND column_name = 'labor_phase_id'
  ) THEN
    ALTER TABLE time_entries ADD COLUMN labor_phase_id uuid REFERENCES labor_phases(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_time_entries_labor_phase_id ON time_entries(labor_phase_id);
