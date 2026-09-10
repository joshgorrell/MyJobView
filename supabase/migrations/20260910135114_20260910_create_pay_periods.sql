/*
# Create Pay Periods and Pay Period Time Locks

## Purpose
Creates tenant-specific pay periods with a full lifecycle (Draft -> Needs Review ->
Payroll Approved -> Submitted -> Processed -> Locked) and an immutable snapshot
mechanism for locking payroll data after submission.

## New Tables

### pay_periods
- Per-tenant pay period definitions (start date, end date, pay date, period type)
- Status lifecycle: draft, needs_review, payroll_approved, submitted, processed, locked
- No submission deadline/countdown fields (per Revision 5)

### pay_period_time_locks
- Immutable JSONB snapshots of all payroll_time_segments at lock time
- Supports period-level or employee-level locks
- After locking, source time entry corrections create new adjustment segments
  in the next pay period — historical payroll is never silently rewritten (Revision 4)

## Functions

### generate_pay_periods(p_org_id, p_start, p_end, p_type)
Creates pay period rows for a tenant on a recurring schedule.

### assign_segments_to_pay_period(p_pay_period_id)
Links all payroll_time_segments whose segment_date falls within the period's
date range to that pay period.

### lock_pay_period(p_pay_period_id)
Marks all segments as is_locked = true, creates JSONB snapshot, sets period
status to 'locked'.

## Security
- RLS enabled on both tables with standard four policies
- Functions are SECURITY DEFINER, tenant-scoped by parameters
*/

-- =========================================================
-- Table: pay_periods
-- =========================================================
CREATE TABLE IF NOT EXISTS pay_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  period_start_date date NOT NULL,
  period_end_date date NOT NULL,
  pay_date date,
  period_type text NOT NULL DEFAULT 'weekly',
  status text NOT NULL DEFAULT 'draft',
  locked_at timestamptz,
  locked_by uuid,
  submitted_at timestamptz,
  submitted_by uuid,
  processed_at timestamptz,
  processed_by uuid,
  payroll_approved_at timestamptz,
  payroll_approved_by uuid,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT pay_periods_date_check CHECK (period_end_date >= period_start_date),
  CONSTRAINT pay_periods_status_check CHECK (
    status IN ('draft', 'needs_review', 'payroll_approved', 'submitted', 'processed', 'locked')
  ),
  CONSTRAINT pay_periods_type_check CHECK (
    period_type IN ('weekly', 'biweekly', 'semimonthly', 'monthly')
  )
);

-- FK
ALTER TABLE pay_periods
  ADD CONSTRAINT pay_periods_organization_fkey
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- Unique constraint
ALTER TABLE pay_periods
  ADD CONSTRAINT pay_periods_org_dates_unique
  UNIQUE (organization_id, period_start_date, period_end_date);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pay_periods_org_id ON pay_periods(organization_id);
CREATE INDEX IF NOT EXISTS idx_pay_periods_status ON pay_periods(organization_id, status);

-- Enable RLS
ALTER TABLE pay_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pay_periods_select_same_org" ON pay_periods;
CREATE POLICY "pay_periods_select_same_org" ON pay_periods FOR SELECT
  TO authenticated USING (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "pay_periods_insert_same_org" ON pay_periods;
CREATE POLICY "pay_periods_insert_same_org" ON pay_periods FOR INSERT
  TO authenticated WITH CHECK (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "pay_periods_update_same_org" ON pay_periods;
CREATE POLICY "pay_periods_update_same_org" ON pay_periods FOR UPDATE
  TO authenticated
  USING (organization_id = get_user_org_id())
  WITH CHECK (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "pay_periods_delete_same_org" ON pay_periods;
CREATE POLICY "pay_periods_delete_same_org" ON pay_periods FOR DELETE
  TO authenticated USING (organization_id = get_user_org_id());

-- Trigger: auto-update updated_at
CREATE OR REPLACE FUNCTION update_pay_periods_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pay_periods_updated_at ON pay_periods;
CREATE TRIGGER trg_pay_periods_updated_at
  BEFORE UPDATE ON pay_periods
  FOR EACH ROW EXECUTE FUNCTION update_pay_periods_updated_at();

-- =========================================================
-- Table: pay_period_time_locks
-- =========================================================
CREATE TABLE IF NOT EXISTS pay_period_time_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  pay_period_id uuid NOT NULL,
  locked_by uuid NOT NULL,
  locked_at timestamptz NOT NULL DEFAULT now(),
  lock_scope text NOT NULL DEFAULT 'period',
  employee_id uuid,
  snapshot_data jsonb NOT NULL,
  CONSTRAINT pptl_scope_check CHECK (lock_scope IN ('period', 'employee'))
);

ALTER TABLE pay_period_time_locks
  ADD CONSTRAINT pptl_organization_fkey
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE pay_period_time_locks
  ADD CONSTRAINT pptl_pay_period_fkey
  FOREIGN KEY (pay_period_id) REFERENCES pay_periods(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_pptl_org_id ON pay_period_time_locks(organization_id);
CREATE INDEX IF NOT EXISTS idx_pptl_pay_period_id ON pay_period_time_locks(pay_period_id);

-- Enable RLS
ALTER TABLE pay_period_time_locks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pptl_select_same_org" ON pay_period_time_locks;
CREATE POLICY "pptl_select_same_org" ON pay_period_time_locks FOR SELECT
  TO authenticated USING (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "pptl_insert_same_org" ON pay_period_time_locks;
CREATE POLICY "pptl_insert_same_org" ON pay_period_time_locks FOR INSERT
  TO authenticated WITH CHECK (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "pptl_update_same_org" ON pay_period_time_locks;
CREATE POLICY "pptl_update_same_org" ON pay_period_time_locks FOR UPDATE
  TO authenticated
  USING (organization_id = get_user_org_id())
  WITH CHECK (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "pptl_delete_same_org" ON pay_period_time_locks;
CREATE POLICY "pptl_delete_same_org" ON pay_period_time_locks FOR DELETE
  TO authenticated USING (organization_id = get_user_org_id());

-- =========================================================
-- Add FK from payroll_time_segments to pay_periods (now that it exists)
-- =========================================================
ALTER TABLE payroll_time_segments
  DROP CONSTRAINT IF EXISTS pts_pay_period_fkey;
ALTER TABLE payroll_time_segments
  ADD CONSTRAINT pts_pay_period_fkey
  FOREIGN KEY (pay_period_id) REFERENCES pay_periods(id) ON DELETE SET NULL;

-- =========================================================
-- Function: generate_pay_periods
-- =========================================================
CREATE OR REPLACE FUNCTION generate_pay_periods(
  p_organization_id uuid,
  p_start_date date,
  p_end_date date,
  p_period_type text DEFAULT 'weekly'
)
RETURNS json AS $$
DECLARE
  v_current date := p_start_date;
  v_end date;
  v_count int := 0;
BEGIN
  WHILE v_current < p_end_date LOOP
    IF p_period_type = 'weekly' THEN
      v_end := v_current + 6;
    ELSIF p_period_type = 'biweekly' THEN
      v_end := v_current + 13;
    ELSIF p_period_type = 'monthly' THEN
      v_end := (date_trunc('month', v_current) + interval '1 month' - interval '1 day')::date;
    ELSIF p_period_type = 'semimonthly' THEN
      IF EXTRACT(DAY FROM v_current) <= 15 THEN
        v_end := v_current + (15 - EXTRACT(DAY FROM v_current)::int);
      ELSE
        v_end := (date_trunc('month', v_current) + interval '1 month' - interval '1 day')::date;
      END IF;
    ELSE
      v_end := v_current + 6;
    END IF;

    IF v_end > p_end_date THEN
      v_end := p_end_date;
    END IF;

    INSERT INTO pay_periods (organization_id, period_start_date, period_end_date, period_type)
    VALUES (p_organization_id, v_current, v_end, p_period_type)
    ON CONFLICT (organization_id, period_start_date, period_end_date) DO NOTHING;

    v_count := v_count + 1;
    v_current := v_end + 1;
  END LOOP;

  RETURN json_build_object('created', v_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================
-- Function: assign_segments_to_pay_period
-- =========================================================
CREATE OR REPLACE FUNCTION assign_segments_to_pay_period(p_pay_period_id uuid)
RETURNS json AS $$
DECLARE
  v_org_id uuid;
  v_start date;
  v_end date;
  v_count int;
BEGIN
  SELECT organization_id, period_start_date, period_end_date
  INTO v_org_id, v_start, v_end
  FROM pay_periods
  WHERE id = p_pay_period_id;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'pay period not found');
  END IF;

  UPDATE payroll_time_segments
  SET pay_period_id = p_pay_period_id
  WHERE organization_id = v_org_id
    AND segment_date >= v_start
    AND segment_date <= v_end
    AND is_locked = false;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN json_build_object('assigned', v_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================
-- Function: lock_pay_period
-- =========================================================
CREATE OR REPLACE FUNCTION lock_pay_period(p_pay_period_id uuid, p_locked_by uuid)
RETURNS json AS $$
DECLARE
  v_org_id uuid;
  v_snapshot jsonb;
  v_count int;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM pay_periods
  WHERE id = p_pay_period_id;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'pay period not found');
  END IF;

  -- Build immutable snapshot of all segments
  SELECT jsonb_agg(to_jsonb(pts.*)) INTO v_snapshot
  FROM payroll_time_segments pts
  WHERE pts.pay_period_id = p_pay_period_id
    AND pts.organization_id = v_org_id;

  -- Create lock record
  INSERT INTO pay_period_time_locks (organization_id, pay_period_id, locked_by, lock_scope, snapshot_data)
  VALUES (v_org_id, p_pay_period_id, p_locked_by, 'period', COALESCE(v_snapshot, '[]'::jsonb));

  -- Mark all segments as locked
  -- We need to bypass the immutability trigger for this one operation
  -- by using a direct approach: set is_locked in a way the trigger allows
  -- The trigger only blocks updates WHERE OLD.is_locked = true; since these
  -- segments currently have is_locked = false, the update will succeed.
  UPDATE payroll_time_segments
  SET is_locked = true,
      locked_at = now()
  WHERE pay_period_id = p_pay_period_id
    AND organization_id = v_org_id
    AND is_locked = false;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Update pay period status
  UPDATE pay_periods
  SET status = 'locked',
      locked_at = now(),
      locked_by = p_locked_by
  WHERE id = p_pay_period_id;

  RETURN json_build_object('locked_segments', v_count, 'snapshot_created', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
