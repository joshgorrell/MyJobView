/*
# Create daily sales report storage

1. Purpose
- Stores reviewed daily sales totals imported from invoice summary reports.
- Keeps report-level metadata separate from each representative's daily totals.
- Supports current-through totals before the month-end close.

2. New Tables
- `sales_daily_reports`
  - `id` — report identifier.
  - `organization_id` — owning organization.
  - `source_file_name` — uploaded report filename.
  - `report_period_start` / `report_period_end` — date range represented by the report.
  - `report_total` — total shown by the source report.
  - `invoice_count` — invoice count shown by the source report.
  - `sales_tax` — sales tax shown by the source report.
  - `balance_due` — balance due shown by the source report.
  - `review_status` — pending or approved.
  - `imported_by` — authenticated user who submitted the report.
  - `created_at` / `updated_at` — audit timestamps.
- `sales_daily_totals`
  - `id` — daily total identifier.
  - `report_id` — source report.
  - `organization_id` — owning organization.
  - `sales_rep_id` / `sales_rep_name` / `sales_rep_initials` — representative identity snapshot.
  - `sales_date` — business date.
  - `invoice_total` — daily invoiced total.
  - `invoice_count` — daily invoice count.
  - `sales_tax` — daily sales tax when supplied.
  - `balance_due` — daily balance due when supplied.
  - `created_at` / `updated_at` — audit timestamps.

3. Integrity and performance
- A representative can have only one approved daily total per organization and date.
- Report totals are numeric with non-negative checks.
- Indexes support organization, representative, and date-range dashboard queries.

4. Security
- RLS is enabled on both tables.
- Admins can create, review, update, and delete their organization's reports and daily totals.
- Managers, sales managers, and finance users can read their organization's data.
- Sales users can read only their own daily totals.
- No anonymous access is granted.

5. Important notes
- Reports remain pending until explicitly approved by an admin.
- Existing monthly and live sales tables are not changed.
*/

CREATE TABLE IF NOT EXISTS sales_daily_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_file_name text NOT NULL DEFAULT '',
  report_period_start date NOT NULL,
  report_period_end date NOT NULL,
  report_total numeric(12, 2) NOT NULL DEFAULT 0 CHECK (report_total >= 0),
  invoice_count integer NOT NULL DEFAULT 0 CHECK (invoice_count >= 0),
  sales_tax numeric(12, 2) NOT NULL DEFAULT 0 CHECK (sales_tax >= 0),
  balance_due numeric(12, 2) NOT NULL DEFAULT 0 CHECK (balance_due >= 0),
  review_status text NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'approved')),
  imported_by uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (report_period_end >= report_period_start)
);

CREATE TABLE IF NOT EXISTS sales_daily_totals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES sales_daily_reports(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sales_rep_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  sales_rep_name text NOT NULL DEFAULT '',
  sales_rep_initials text NOT NULL DEFAULT '',
  sales_date date NOT NULL,
  invoice_total numeric(12, 2) NOT NULL DEFAULT 0 CHECK (invoice_total >= 0),
  invoice_count integer NOT NULL DEFAULT 0 CHECK (invoice_count >= 0),
  sales_tax numeric(12, 2) NOT NULL DEFAULT 0 CHECK (sales_tax >= 0),
  balance_due numeric(12, 2) NOT NULL DEFAULT 0 CHECK (balance_due >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, sales_rep_id, sales_date)
);

CREATE INDEX IF NOT EXISTS idx_sales_daily_reports_org_period
  ON sales_daily_reports (organization_id, report_period_end DESC);
CREATE INDEX IF NOT EXISTS idx_sales_daily_reports_org_status
  ON sales_daily_reports (organization_id, review_status);
CREATE INDEX IF NOT EXISTS idx_sales_daily_totals_org_date
  ON sales_daily_totals (organization_id, sales_date DESC);
CREATE INDEX IF NOT EXISTS idx_sales_daily_totals_org_rep_date
  ON sales_daily_totals (organization_id, sales_rep_id, sales_date DESC);
CREATE INDEX IF NOT EXISTS idx_sales_daily_totals_report
  ON sales_daily_totals (report_id);

ALTER TABLE sales_daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_daily_totals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Daily reports admins manage org" ON sales_daily_reports;
CREATE POLICY "Daily reports admins manage org"
  ON sales_daily_reports FOR ALL
  TO authenticated
  USING (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  )
  WITH CHECK (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND imported_by = auth.uid()
  );

DROP POLICY IF EXISTS "Daily reports managers read org" ON sales_daily_reports;
CREATE POLICY "Daily reports managers read org"
  ON sales_daily_reports FOR SELECT
  TO authenticated
  USING (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('manager', 'sales_manager', 'finance')
  );

DROP POLICY IF EXISTS "Daily totals admins manage org" ON sales_daily_totals;
CREATE POLICY "Daily totals admins manage org"
  ON sales_daily_totals FOR ALL
  TO authenticated
  USING (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  )
  WITH CHECK (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM sales_daily_reports r
      WHERE r.id = sales_daily_totals.report_id
        AND r.organization_id = sales_daily_totals.organization_id
    )
  );

DROP POLICY IF EXISTS "Daily totals managers read org" ON sales_daily_totals;
CREATE POLICY "Daily totals managers read org"
  ON sales_daily_totals FOR SELECT
  TO authenticated
  USING (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('manager', 'sales_manager', 'finance')
  );

DROP POLICY IF EXISTS "Sales users read own daily totals" ON sales_daily_totals;
CREATE POLICY "Sales users read own daily totals"
  ON sales_daily_totals FOR SELECT
  TO authenticated
  USING (
    sales_rep_id = auth.uid()
    AND organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
  );