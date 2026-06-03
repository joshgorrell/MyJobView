/*
  # Commission Report Support Tables

  ## Overview
  Adds two tables to support the Pay Period Commission Report feature.
  These tables store non-destructive overrides and deductions so the
  underlying commission_records data is never modified by report adjustments.

  ## New Tables

  ### commission_report_rate_overrides
  - Stores per-rep, per-invoice rate overrides entered by admin during report review
  - Links to invoice_id + employee_id to identify the specific commission line
  - Preserves original rate alongside override for audit purposes

  ### commission_report_deductions
  - Stores manual deductions entered per rep per pay period
  - Reduces a rep's final commission payout (e.g. chargebacks, corrections)
  - Scoped to a date range (pay period) for organized reporting

  ## Security
  - RLS enabled on both tables
  - Only authenticated admin/manager users can insert/update/delete
  - All authenticated users in the org can read (for report viewing)
*/

-- ─── commission_report_rate_overrides ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS commission_report_rate_overrides (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL,
  invoice_id        uuid REFERENCES invoices(id) ON DELETE CASCADE,
  employee_id       uuid REFERENCES profiles(id) ON DELETE CASCADE,
  role_type         text NOT NULL,
  original_rate     numeric(5,2),
  overridden_rate   numeric(5,2) NOT NULL,
  notes             text DEFAULT '',
  created_by        uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now(),
  UNIQUE (organization_id, invoice_id, employee_id, role_type)
);

ALTER TABLE commission_report_rate_overrides ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_crro_org_id
  ON commission_report_rate_overrides(organization_id);
CREATE INDEX IF NOT EXISTS idx_crro_invoice_employee
  ON commission_report_rate_overrides(invoice_id, employee_id);

-- Read: all authenticated users in org
CREATE POLICY "Org members can view rate overrides"
  ON commission_report_rate_overrides FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Insert: authenticated users
CREATE POLICY "Authenticated users can insert rate overrides"
  ON commission_report_rate_overrides FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Update: authenticated users
CREATE POLICY "Authenticated users can update rate overrides"
  ON commission_report_rate_overrides FOR UPDATE
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Delete: authenticated users
CREATE POLICY "Authenticated users can delete rate overrides"
  ON commission_report_rate_overrides FOR DELETE
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- ─── commission_report_deductions ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS commission_report_deductions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL,
  employee_id       uuid REFERENCES profiles(id) ON DELETE CASCADE,
  period_start      date NOT NULL,
  period_end        date NOT NULL,
  description       text NOT NULL DEFAULT '',
  amount            numeric(12,2) NOT NULL DEFAULT 0,
  created_by        uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

ALTER TABLE commission_report_deductions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_crd_org_id
  ON commission_report_deductions(organization_id);
CREATE INDEX IF NOT EXISTS idx_crd_employee_period
  ON commission_report_deductions(employee_id, period_start, period_end);

-- Read
CREATE POLICY "Org members can view deductions"
  ON commission_report_deductions FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Insert
CREATE POLICY "Authenticated users can insert deductions"
  ON commission_report_deductions FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Update
CREATE POLICY "Authenticated users can update deductions"
  ON commission_report_deductions FOR UPDATE
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Delete
CREATE POLICY "Authenticated users can delete deductions"
  ON commission_report_deductions FOR DELETE
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );
