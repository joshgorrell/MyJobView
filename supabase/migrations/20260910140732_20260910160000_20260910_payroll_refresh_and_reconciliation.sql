/*
# Payroll Refresh, Auto-Approvals, and Reconciliation

## Purpose
1. Adds a single `refresh_payroll_time(p_pay_period_id)` function that the UI calls
   to regenerate unlocked payroll segments, assign them to the pay period, run
   jurisdiction determination, auto-create missing payroll_approvals rows, run
   reconciliation, and return a summary — all in one idempotent call.
2. Adds `payroll_reconciliation_flags` table to track per-employee/per-day
   variance between daily clock hours and payroll segment hours.
3. Adds `last_refresh_at` and `last_segment_count` columns to `pay_periods` so the
   UI can display when the last refresh happened and how many segments were touched.
4. Adds `reconcile_payroll_segments(p_pay_period_id)` function that compares
   daily_clock_entries total_hours against the sum of payroll_time_segments
   total_hours for each employee/day, flagging variances > 0.01h as needs_review.

## New Tables
### payroll_reconciliation_flags
- One row per employee/day within a pay period
- daily_clock_hours: sum of paid hours from daily_clock_entries
- segment_hours: sum of total_hours from payroll_time_segments
- variance_hours: daily_clock_hours - segment_hours
- needs_review: true when |variance| > 0.01
- resolution_status: 'unresolved', 'resolved', 'ignored'

## Modified Tables
### pay_periods
- last_refresh_at (timestamptz, nullable) — when refresh_payroll_time was last called
- last_segment_count (integer, nullable) — number of segments created/updated by last refresh

## Functions
### refresh_payroll_time(p_pay_period_id)
Returns JSON: { segments_created, segments_updated, segments_assigned,
  jurisdiction_high, jurisdiction_medium, jurisdiction_low, jurisdiction_unassigned,
  approvals_created, reconciliation_flags, refreshed_at }

### reconcile_payroll_segments(p_pay_period_id)
Returns JSON: { total_days_checked, flagged_days, total_variance_hours }

## Security
- RLS enabled on payroll_reconciliation_flags with standard four policies
- Functions are SECURITY DEFINER, tenant-scoped by the pay period's organization_id
*/

-- =========================================================
-- Add refresh tracking columns to pay_periods
-- =========================================================
ALTER TABLE pay_periods
  ADD COLUMN IF NOT EXISTS last_refresh_at timestamptz;
ALTER TABLE pay_periods
  ADD COLUMN IF NOT EXISTS last_segment_count integer;

-- =========================================================
-- Table: payroll_reconciliation_flags
-- =========================================================
CREATE TABLE IF NOT EXISTS payroll_reconciliation_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  pay_period_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  segment_date date NOT NULL,
  daily_clock_hours numeric NOT NULL DEFAULT 0,
  segment_hours numeric NOT NULL DEFAULT 0,
  variance_hours numeric NOT NULL DEFAULT 0,
  needs_review boolean NOT NULL DEFAULT false,
  resolution_status text NOT NULL DEFAULT 'unresolved',
  resolution_note text,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT prf_resolution_check CHECK (resolution_status IN ('unresolved', 'resolved', 'ignored'))
);

ALTER TABLE payroll_reconciliation_flags
  ADD CONSTRAINT prf_organization_fkey
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE payroll_reconciliation_flags
  ADD CONSTRAINT prf_pay_period_fkey
  FOREIGN KEY (pay_period_id) REFERENCES pay_periods(id) ON DELETE CASCADE;

ALTER TABLE payroll_reconciliation_flags
  ADD CONSTRAINT prf_employee_fkey
  FOREIGN KEY (employee_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- Unique constraint: one flag per employee/day/period
ALTER TABLE payroll_reconciliation_flags
  ADD CONSTRAINT prf_period_employee_date_unique
  UNIQUE (pay_period_id, employee_id, segment_date);

CREATE INDEX IF NOT EXISTS idx_prf_org_id ON payroll_reconciliation_flags(organization_id);
CREATE INDEX IF NOT EXISTS idx_prf_pay_period_id ON payroll_reconciliation_flags(pay_period_id);
CREATE INDEX IF NOT EXISTS idx_prf_employee_id ON payroll_reconciliation_flags(employee_id);
CREATE INDEX IF NOT EXISTS idx_prf_needs_review ON payroll_reconciliation_flags(pay_period_id, needs_review);

-- Enable RLS
ALTER TABLE payroll_reconciliation_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prf_select_same_org" ON payroll_reconciliation_flags;
CREATE POLICY "prf_select_same_org" ON payroll_reconciliation_flags FOR SELECT
  TO authenticated USING (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "prf_insert_same_org" ON payroll_reconciliation_flags;
CREATE POLICY "prf_insert_same_org" ON payroll_reconciliation_flags FOR INSERT
  TO authenticated WITH CHECK (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "prf_update_same_org" ON payroll_reconciliation_flags;
CREATE POLICY "prf_update_same_org" ON payroll_reconciliation_flags FOR UPDATE
  TO authenticated
  USING (organization_id = get_user_org_id())
  WITH CHECK (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "prf_delete_same_org" ON payroll_reconciliation_flags;
CREATE POLICY "prf_delete_same_org" ON payroll_reconciliation_flags FOR DELETE
  TO authenticated USING (organization_id = get_user_org_id());

-- Trigger: auto-update updated_at
CREATE OR REPLACE FUNCTION update_prf_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prf_updated_at ON payroll_reconciliation_flags;
CREATE TRIGGER trg_prf_updated_at
  BEFORE UPDATE ON payroll_reconciliation_flags
  FOR EACH ROW EXECUTE FUNCTION update_prf_updated_at();

-- =========================================================
-- Function: reconcile_payroll_segments
-- =========================================================
CREATE OR REPLACE FUNCTION reconcile_payroll_segments(p_pay_period_id uuid)
RETURNS json AS $$
DECLARE
  v_org_id uuid;
  v_start date;
  v_end date;
  v_days_checked int := 0;
  v_flagged int := 0;
  v_total_variance numeric := 0;
  v_daily_hours numeric;
  v_seg_hours numeric;
  v_variance numeric;
  v_emp_id uuid;
  v_day date;
BEGIN
  SELECT organization_id, period_start_date, period_end_date
  INTO v_org_id, v_start, v_end
  FROM pay_periods
  WHERE id = p_pay_period_id;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'pay period not found');
  END IF;

  -- Build a set of all employee/day combos that have either daily clock entries
  -- or payroll segments within this period
  FOR v_emp_id, v_day IN
    SELECT DISTINCT COALESCE(dce.technician_id, pts.employee_id) AS emp_id,
           COALESCE(dce.entry_date, pts.segment_date) AS day
    FROM daily_clock_entries dce
    FULL OUTER JOIN payroll_time_segments pts
      ON pts.employee_id = dce.technician_id
      AND pts.segment_date = dce.entry_date
      AND pts.pay_period_id = p_pay_period_id
    WHERE COALESCE(dce.organization_id, pts.organization_id) = v_org_id
      AND COALESCE(dce.entry_date, pts.segment_date) >= v_start
      AND COALESCE(dce.entry_date, pts.segment_date) <= v_end
      AND (
        (dce.id IS NOT NULL AND dce.status = 'clocked_out')
        OR pts.id IS NOT NULL
      )
  LOOP
    v_days_checked := v_days_checked + 1;

    -- Sum daily clock paid hours
    SELECT COALESCE(SUM(COALESCE(payroll_hours_only, total_hours, 0)), 0)
    INTO v_daily_hours
    FROM daily_clock_entries
    WHERE technician_id = v_emp_id
      AND entry_date = v_day
      AND organization_id = v_org_id
      AND status = 'clocked_out';

    -- Sum payroll segment hours
    SELECT COALESCE(SUM(COALESCE(total_hours, 0)), 0)
    INTO v_seg_hours
    FROM payroll_time_segments
    WHERE employee_id = v_emp_id
      AND segment_date = v_day
      AND pay_period_id = p_pay_period_id
      AND organization_id = v_org_id;

    v_variance := v_daily_hours - v_seg_hours;

    -- Upsert reconciliation flag
    INSERT INTO payroll_reconciliation_flags (
      organization_id, pay_period_id, employee_id, segment_date,
      daily_clock_hours, segment_hours, variance_hours, needs_review,
      resolution_status
    )
    VALUES (
      v_org_id, p_pay_period_id, v_emp_id, v_day,
      v_daily_hours, v_seg_hours, v_variance,
      ABS(v_variance) > 0.01,
      'unresolved'
    )
    ON CONFLICT (pay_period_id, employee_id, segment_date)
    DO UPDATE SET
      daily_clock_hours = EXCLUDED.daily_clock_hours,
      segment_hours = EXCLUDED.segment_hours,
      variance_hours = EXCLUDED.variance_hours,
      needs_review = EXCLUDED.needs_review,
      resolution_status = CASE
        WHEN payroll_reconciliation_flags.resolution_status = 'resolved'
          AND EXCLUDED.needs_review = true
        THEN 'unresolved'
        ELSE payroll_reconciliation_flags.resolution_status
      END
    WHERE payroll_reconciliation_flags.resolution_status != 'ignored';

    IF ABS(v_variance) > 0.01 THEN
      v_flagged := v_flagged + 1;
      v_total_variance := v_total_variance + ABS(v_variance);
    END IF;
  END LOOP;

  RETURN json_build_object(
    'total_days_checked', v_days_checked,
    'flagged_days', v_flagged,
    'total_variance_hours', v_total_variance
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================
-- Function: refresh_payroll_time
-- =========================================================
-- Single entry point for the UI "Refresh Payroll Time" button.
-- Chains: regenerate_payroll_segments -> assign_segments_to_pay_period ->
--         batch_determine_jurisdiction (on segments) ->
--         auto-create missing payroll_approvals ->
--         reconcile_payroll_segments -> update pay_periods tracking columns
CREATE OR REPLACE FUNCTION refresh_payroll_time(p_pay_period_id uuid)
RETURNS json AS $$
DECLARE
  v_org_id uuid;
  v_start date;
  v_end date;
  v_seg_result json;
  v_assign_result json;
  v_segments_count int := 0;
  v_jur_high int := 0;
  v_jur_medium int := 0;
  v_jur_low int := 0;
  v_jur_unassigned int := 0;
  v_approvals_created int := 0;
  v_recon_result json;
  v_refreshed_at timestamptz := now();
  v_seg_id uuid;
  v_jur_result json;
  v_emp_id uuid;
BEGIN
  SELECT organization_id, period_start_date, period_end_date
  INTO v_org_id, v_start, v_end
  FROM pay_periods
  WHERE id = p_pay_period_id;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'pay period not found');
  END IF;

  -- 1. Regenerate unlocked segments
  v_seg_result := regenerate_payroll_segments(v_org_id, v_start, v_end);
  v_segments_count := COALESCE((v_seg_result->>'inserted_or_updated')::int, 0);

  -- 2. Assign segments to this pay period
  v_assign_result := assign_segments_to_pay_period(p_pay_period_id);

  -- 3. Run jurisdiction determination on all segments in this period
  FOR v_seg_id IN
    SELECT id FROM payroll_time_segments
    WHERE pay_period_id = p_pay_period_id
      AND organization_id = v_org_id
      AND is_locked = false
  LOOP
    v_jur_result := determine_segment_jurisdiction(v_seg_id);

    UPDATE payroll_time_segments
    SET
      work_jurisdiction_state = (v_jur_result->>'jurisdiction_state')::text,
      work_jurisdiction_source = (v_jur_result->>'jurisdiction_source')::text,
      work_jurisdiction_confidence = (v_jur_result->>'confidence')::text,
      gps_validated = (v_jur_result->>'gps_validated')::boolean
    WHERE id = v_seg_id;

    IF (v_jur_result->>'confidence') = 'high' THEN
      v_jur_high := v_jur_high + 1;
    ELSIF (v_jur_result->>'confidence') = 'medium' THEN
      v_jur_medium := v_jur_medium + 1;
    ELSIF (v_jur_result->>'confidence') = 'low' THEN
      v_jur_low := v_jur_low + 1;
    ELSIF (v_jur_result->>'confidence') = 'unassigned' THEN
      v_jur_unassigned := v_jur_unassigned + 1;
    END IF;
  END LOOP;

  -- 4. Auto-create missing payroll_approvals rows
  FOR v_emp_id IN
    SELECT DISTINCT employee_id
    FROM payroll_time_segments
    WHERE pay_period_id = p_pay_period_id
      AND organization_id = v_org_id
  LOOP
    INSERT INTO payroll_approvals (
      organization_id, pay_period_id, employee_id, approval_status
    )
    VALUES (v_org_id, p_pay_period_id, v_emp_id, 'pending')
    ON CONFLICT (pay_period_id, employee_id) DO NOTHING;

    GET DIAGNOSTICS v_approvals_created = ROW_COUNT;
  END LOOP;

  -- 5. Run reconciliation
  v_recon_result := reconcile_payroll_segments(p_pay_period_id);

  -- 6. Update pay period tracking columns
  UPDATE pay_periods
  SET
    last_refresh_at = v_refreshed_at,
    last_segment_count = v_segments_count
  WHERE id = p_pay_period_id;

  RETURN json_build_object(
    'segments_created_or_updated', v_segments_count,
    'segments_assigned', COALESCE((v_assign_result->>'assigned')::int, 0),
    'jurisdiction_high', v_jur_high,
    'jurisdiction_medium', v_jur_medium,
    'jurisdiction_low', v_jur_low,
    'jurisdiction_unassigned', v_jur_unassigned,
    'approvals_created', v_approvals_created,
    'reconciliation_flags', COALESCE((v_recon_result->>'flagged_days')::int, 0),
    'reconciliation_total_variance', COALESCE((v_recon_result->>'total_variance_hours')::numeric, 0),
    'refreshed_at', v_refreshed_at
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;