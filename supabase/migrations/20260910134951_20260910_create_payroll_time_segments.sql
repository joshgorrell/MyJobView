/*
# Create Payroll Time Segments Table

## Purpose
Creates a new `payroll_time_segments` table that normalizes an employee's work day
into individual payroll-ready segments. Each segment represents one contiguous block
of work (e.g., 8-10am shop, 10:30am-2:30pm Missouri job, 3-5pm Kansas job) with its
own jurisdiction, time type, and approval status.

Source records (time_entries, daily_clock_entries, internal_time_sessions,
service_labor_entries) are NEVER modified by segment generation. Segments are a
derived payroll view layer.

## Idempotency Strategy (Revised)
- Uses a `segment_key` (text, NOT NULL) column with a unique constraint on
  (organization_id, segment_key) instead of (source_table, source_record_id).
- segment_key format: '{source_table}:{source_record_id}:{sequence}' (e.g., 'time_entries:abc:0')
- This allows a single source record to eventually produce multiple segments
  (for midnight splits, jurisdiction changes, travel) while still guaranteeing
  regeneration cannot create duplicates.
- The regenerate function uses INSERT ... ON CONFLICT (organization_id, segment_key)
  DO UPDATE (only when is_locked = false) for idempotent upsert behavior.

## Immutability (Revision 4)
- Once is_locked = true, a BEFORE UPDATE/DELETE trigger prevents any modification.
- Corrections to locked segments create NEW rows linked via correction_of_segment_id.
- Historical payroll is never silently rewritten.

## New Table: payroll_time_segments
Columns documented inline below.

## Security
- RLS enabled with standard four policies using organization_id = get_user_org_id()
*/

CREATE TABLE IF NOT EXISTS payroll_time_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  segment_date date NOT NULL,
  start_time timestamptz NOT NULL,
  end_time timestamptz,
  total_hours numeric,
  break_minutes integer,
  time_type text NOT NULL,
  source_table text NOT NULL,
  source_record_id uuid,
  segment_key text NOT NULL,
  segment_sequence integer NOT NULL DEFAULT 0,
  daily_clock_entry_id uuid,
  work_order_id uuid,
  project_id uuid,
  labor_phase_id uuid,
  overtime_hours numeric,
  work_jurisdiction_state text,
  work_jurisdiction_source text,
  work_jurisdiction_confidence text DEFAULT 'unassigned',
  work_jurisdiction_override_by uuid,
  work_jurisdiction_override_reason text,
  physical_work_location_state text,
  physical_work_lat numeric,
  physical_work_lng numeric,
  gps_validated boolean,
  payroll_approval_status text NOT NULL DEFAULT 'pending',
  payroll_approved_by uuid,
  payroll_approved_at timestamptz,
  pay_period_id uuid,
  is_locked boolean NOT NULL DEFAULT false,
  locked_at timestamptz,
  correction_of_segment_id uuid,
  correction_reason text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Foreign keys (pay_periods FK added in Migration 5 when that table is created)
ALTER TABLE payroll_time_segments
  ADD CONSTRAINT pts_organization_fkey
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE payroll_time_segments
  ADD CONSTRAINT pts_employee_fkey
  FOREIGN KEY (employee_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE payroll_time_segments
  ADD CONSTRAINT pts_correction_of_fkey
  FOREIGN KEY (correction_of_segment_id) REFERENCES payroll_time_segments(id) ON DELETE SET NULL;

-- Unique constraint for idempotent upsert
ALTER TABLE payroll_time_segments
  ADD CONSTRAINT pts_segment_key_unique
  UNIQUE (organization_id, segment_key);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pts_org_id ON payroll_time_segments(organization_id);
CREATE INDEX IF NOT EXISTS idx_pts_employee_id ON payroll_time_segments(employee_id);
CREATE INDEX IF NOT EXISTS idx_pts_segment_date ON payroll_time_segments(segment_date);
CREATE INDEX IF NOT EXISTS idx_pts_pay_period_id ON payroll_time_segments(pay_period_id);
CREATE INDEX IF NOT EXISTS idx_pts_approval_status ON payroll_time_segments(payroll_approval_status);
CREATE INDEX IF NOT EXISTS idx_pts_jurisdiction_state ON payroll_time_segments(work_jurisdiction_state);
CREATE INDEX IF NOT EXISTS idx_pts_jurisdiction_confidence ON payroll_time_segments(work_jurisdiction_confidence);
CREATE INDEX IF NOT EXISTS idx_pts_source ON payroll_time_segments(source_table, source_record_id);
CREATE INDEX IF NOT EXISTS idx_pts_is_locked ON payroll_time_segments(is_locked);

-- Enable RLS
ALTER TABLE payroll_time_segments ENABLE ROW LEVEL SECURITY;

-- Standard four RLS policies
DROP POLICY IF EXISTS "pts_select_same_org" ON payroll_time_segments;
CREATE POLICY "pts_select_same_org" ON payroll_time_segments FOR SELECT
  TO authenticated USING (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "pts_insert_same_org" ON payroll_time_segments;
CREATE POLICY "pts_insert_same_org" ON payroll_time_segments FOR INSERT
  TO authenticated WITH CHECK (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "pts_update_same_org" ON payroll_time_segments;
CREATE POLICY "pts_update_same_org" ON payroll_time_segments FOR UPDATE
  TO authenticated
  USING (organization_id = get_user_org_id())
  WITH CHECK (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "pts_delete_same_org" ON payroll_time_segments;
CREATE POLICY "pts_delete_same_org" ON payroll_time_segments FOR DELETE
  TO authenticated USING (organization_id = get_user_org_id());

-- =========================================================
-- Trigger: auto-update updated_at
-- =========================================================
CREATE OR REPLACE FUNCTION update_pts_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pts_updated_at ON payroll_time_segments;
CREATE TRIGGER trg_pts_updated_at
  BEFORE UPDATE ON payroll_time_segments
  FOR EACH ROW EXECUTE FUNCTION update_pts_updated_at();

-- =========================================================
-- Trigger: prevent modification of locked segments (immutability)
-- =========================================================
CREATE OR REPLACE FUNCTION prevent_locked_segment_modification()
RETURNS trigger AS $$
BEGIN
  IF OLD.is_locked = true THEN
    RAISE EXCEPTION 'Cannot modify locked payroll time segment %. Use the correction workflow instead.', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pts_prevent_locked_update ON payroll_time_segments;
CREATE TRIGGER trg_pts_prevent_locked_update
  BEFORE UPDATE ON payroll_time_segments
  FOR EACH ROW EXECUTE FUNCTION prevent_locked_segment_modification();

DROP TRIGGER IF EXISTS trg_pts_prevent_locked_delete ON payroll_time_segments;
CREATE TRIGGER trg_pts_prevent_locked_delete
  BEFORE DELETE ON payroll_time_segments
  FOR EACH ROW EXECUTE FUNCTION prevent_locked_segment_modification();
