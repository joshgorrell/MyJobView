/*
# Create Payroll Corrections Table

## Purpose
Ensures that changes to source time entries after payroll submission never silently
rewrite historical payroll. Corrections are tracked, reviewed, and applied to a
future pay period rather than modifying locked segments.

## New Table: payroll_corrections
- Links an original (locked) segment to a corrected segment in a future pay period
- Tracks correction type: hours_adjustment, jurisdiction_change, time_type_change, removal
- Status workflow: open -> applied (or rejected)
- Records original and corrected values for audit trail

## Security
- RLS enabled with standard four policies
*/

CREATE TABLE IF NOT EXISTS payroll_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  original_segment_id uuid NOT NULL,
  corrected_segment_id uuid,
  correction_type text NOT NULL,
  original_hours numeric,
  corrected_hours numeric,
  original_jurisdiction text,
  corrected_jurisdiction text,
  reason text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  status text NOT NULL DEFAULT 'open',
  applied_to_pay_period_id uuid,
  applied_at timestamptz,
  CONSTRAINT pc_type_check CHECK (
    correction_type IN ('hours_adjustment', 'jurisdiction_change', 'time_type_change', 'removal')
  ),
  CONSTRAINT pc_status_check CHECK (status IN ('open', 'applied', 'rejected'))
);

-- FKs
ALTER TABLE payroll_corrections
  ADD CONSTRAINT pc_organization_fkey
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE payroll_corrections
  ADD CONSTRAINT pc_original_segment_fkey
  FOREIGN KEY (original_segment_id) REFERENCES payroll_time_segments(id) ON DELETE RESTRICT;

ALTER TABLE payroll_corrections
  ADD CONSTRAINT pc_corrected_segment_fkey
  FOREIGN KEY (corrected_segment_id) REFERENCES payroll_time_segments(id) ON DELETE SET NULL;

ALTER TABLE payroll_corrections
  ADD CONSTRAINT pc_applied_to_period_fkey
  FOREIGN KEY (applied_to_pay_period_id) REFERENCES pay_periods(id) ON DELETE SET NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pc_org_id ON payroll_corrections(organization_id);
CREATE INDEX IF NOT EXISTS idx_pc_original_segment ON payroll_corrections(original_segment_id);
CREATE INDEX IF NOT EXISTS idx_pc_status ON payroll_corrections(organization_id, status);

-- Enable RLS
ALTER TABLE payroll_corrections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pc_select_same_org" ON payroll_corrections;
CREATE POLICY "pc_select_same_org" ON payroll_corrections FOR SELECT
  TO authenticated USING (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "pc_insert_same_org" ON payroll_corrections;
CREATE POLICY "pc_insert_same_org" ON payroll_corrections FOR INSERT
  TO authenticated WITH CHECK (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "pc_update_same_org" ON payroll_corrections;
CREATE POLICY "pc_update_same_org" ON payroll_corrections FOR UPDATE
  TO authenticated
  USING (organization_id = get_user_org_id())
  WITH CHECK (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "pc_delete_same_org" ON payroll_corrections;
CREATE POLICY "pc_delete_same_org" ON payroll_corrections FOR DELETE
  TO authenticated USING (organization_id = get_user_org_id());
