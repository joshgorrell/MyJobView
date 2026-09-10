/*
# Create Payroll Approval Layer

## Purpose
Creates a payroll-readiness approval layer that is SEPARATE from existing job/time
approvals. Payroll admins can approve time for payroll without changing the
operational meaning of existing approvals (approved_by, marked_complete on time_entries).

## New Table: payroll_approvals
- One row per employee per pay period
- approval_status: 'pending', 'approved', 'excluded'
- Stores snapshot of approved hours (total, regular, OT, PTO)
- Unique constraint on (pay_period_id, employee_id)

## Function: check_payroll_readiness(p_pay_period_id)
Returns a summary of payroll readiness for a pay period:
- Total employees, approved count, pending count
- Segments with unassigned jurisdiction
- Segments with GPS/job mismatches
- Pending time adjustments

## Security
- RLS enabled with standard four policies
- Functions are SECURITY DEFINER, tenant-scoped
*/

CREATE TABLE IF NOT EXISTS payroll_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  pay_period_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  approval_status text NOT NULL DEFAULT 'pending',
  approved_by uuid,
  approved_at timestamptz,
  exclusion_reason text,
  total_hours numeric,
  regular_hours numeric,
  overtime_hours numeric,
  pto_hours numeric,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT pa_status_check CHECK (approval_status IN ('pending', 'approved', 'excluded'))
);

-- FKs
ALTER TABLE payroll_approvals
  ADD CONSTRAINT pa_organization_fkey
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE payroll_approvals
  ADD CONSTRAINT pa_pay_period_fkey
  FOREIGN KEY (pay_period_id) REFERENCES pay_periods(id) ON DELETE CASCADE;

ALTER TABLE payroll_approvals
  ADD CONSTRAINT pa_employee_fkey
  FOREIGN KEY (employee_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- Unique constraint
ALTER TABLE payroll_approvals
  ADD CONSTRAINT pa_period_employee_unique
  UNIQUE (pay_period_id, employee_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pa_org_id ON payroll_approvals(organization_id);
CREATE INDEX IF NOT EXISTS idx_pa_pay_period_id ON payroll_approvals(pay_period_id);
CREATE INDEX IF NOT EXISTS idx_pa_status ON payroll_approvals(pay_period_id, approval_status);

-- Enable RLS
ALTER TABLE payroll_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pa_select_same_org" ON payroll_approvals;
CREATE POLICY "pa_select_same_org" ON payroll_approvals FOR SELECT
  TO authenticated USING (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "pa_insert_same_org" ON payroll_approvals;
CREATE POLICY "pa_insert_same_org" ON payroll_approvals FOR INSERT
  TO authenticated WITH CHECK (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "pa_update_same_org" ON payroll_approvals;
CREATE POLICY "pa_update_same_org" ON payroll_approvals FOR UPDATE
  TO authenticated
  USING (organization_id = get_user_org_id())
  WITH CHECK (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "pa_delete_same_org" ON payroll_approvals;
CREATE POLICY "pa_delete_same_org" ON payroll_approvals FOR DELETE
  TO authenticated USING (organization_id = get_user_org_id());

-- Trigger: auto-update updated_at
CREATE OR REPLACE FUNCTION update_pa_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pa_updated_at ON payroll_approvals;
CREATE TRIGGER trg_pa_updated_at
  BEFORE UPDATE ON payroll_approvals
  FOR EACH ROW EXECUTE FUNCTION update_pa_updated_at();

-- =========================================================
-- Function: check_payroll_readiness
-- =========================================================
CREATE OR REPLACE FUNCTION check_payroll_readiness(p_pay_period_id uuid)
RETURNS json AS $$
DECLARE
  v_org_id uuid;
  v_start date;
  v_end date;
  v_total_employees int;
  v_approved_count int;
  v_pending_count int;
  v_excluded_count int;
  v_unassigned_jurisdiction int;
  v_gps_mismatches int;
  v_pending_adjustments int;
  v_total_segments int;
BEGIN
  SELECT organization_id, period_start_date, period_end_date
  INTO v_org_id, v_start, v_end
  FROM pay_periods
  WHERE id = p_pay_period_id;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'pay period not found');
  END IF;

  -- Count distinct employees with segments in this period
  SELECT COUNT(DISTINCT employee_id) INTO v_total_employees
  FROM payroll_time_segments
  WHERE pay_period_id = p_pay_period_id
    AND organization_id = v_org_id;

  -- Count approvals by status
  SELECT
    COUNT(*) FILTER (WHERE approval_status = 'approved'),
    COUNT(*) FILTER (WHERE approval_status = 'pending'),
    COUNT(*) FILTER (WHERE approval_status = 'excluded')
  INTO v_approved_count, v_pending_count, v_excluded_count
  FROM payroll_approvals
  WHERE pay_period_id = p_pay_period_id;

  -- Segments with unassigned jurisdiction
  SELECT COUNT(*) INTO v_unassigned_jurisdiction
  FROM payroll_time_segments
  WHERE pay_period_id = p_pay_period_id
    AND organization_id = v_org_id
    AND (work_jurisdiction_state IS NULL OR work_jurisdiction_confidence = 'unassigned');

  -- Segments with GPS/job mismatches (confidence = 'low')
  SELECT COUNT(*) INTO v_gps_mismatches
  FROM payroll_time_segments
  WHERE pay_period_id = p_pay_period_id
    AND organization_id = v_org_id
    AND work_jurisdiction_confidence = 'low';

  -- Pending time adjustments for employees in this period
  SELECT COUNT(*) INTO v_pending_adjustments
  FROM time_adjustment_requests tar
  WHERE tar.organization_id = v_org_id
    AND tar.status = 'pending'
    AND tar.technician_id IN (
      SELECT DISTINCT employee_id
      FROM payroll_time_segments
      WHERE pay_period_id = p_pay_period_id
    );

  -- Total segments
  SELECT COUNT(*) INTO v_total_segments
  FROM payroll_time_segments
  WHERE pay_period_id = p_pay_period_id
    AND organization_id = v_org_id;

  RETURN json_build_object(
    'total_employees', v_total_employees,
    'approved_count', v_approved_count,
    'pending_count', v_pending_count,
    'excluded_count', v_excluded_count,
    'total_segments', v_total_segments,
    'unassigned_jurisdiction', v_unassigned_jurisdiction,
    'gps_mismatches', v_gps_mismatches,
    'pending_adjustments', v_pending_adjustments,
    'ready_for_submission',
      v_unassigned_jurisdiction = 0
      AND v_gps_mismatches = 0
      AND v_pending_count = 0
      AND v_pending_adjustments = 0
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
