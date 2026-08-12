/*
# Tighten daily sales report access rules

1. Replace broad policies
- Replaces combined ALL policies with separate SELECT, INSERT, UPDATE, and DELETE policies.
- Keeps admins as the only writers.
- Keeps managers, sales managers, and finance as organization readers.
- Keeps sales users restricted to their own daily totals.

2. Security notes
- Report ownership is checked against the signed-in profile organization.
- New reports must record the signed-in importer.
- Daily totals must reference a report from the same organization.
- Immutable audit and tenant columns are not client-updatable.
*/

DROP POLICY IF EXISTS "Daily reports admins manage org" ON sales_daily_reports;
DROP POLICY IF EXISTS "Daily reports managers read org" ON sales_daily_reports;
DROP POLICY IF EXISTS "Daily totals admins manage org" ON sales_daily_totals;
DROP POLICY IF EXISTS "Daily totals managers read org" ON sales_daily_totals;
DROP POLICY IF EXISTS "Sales users read own daily totals" ON sales_daily_totals;

CREATE POLICY "Daily reports admins read org"
  ON sales_daily_reports FOR SELECT
  TO authenticated
  USING (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "Daily reports managers read org"
  ON sales_daily_reports FOR SELECT
  TO authenticated
  USING (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('manager', 'sales_manager', 'finance')
  );

CREATE POLICY "Daily reports admins insert org"
  ON sales_daily_reports FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND imported_by = auth.uid()
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "Daily reports admins update org"
  ON sales_daily_reports FOR UPDATE
  TO authenticated
  USING (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  )
  WITH CHECK (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "Daily reports admins delete org"
  ON sales_daily_reports FOR DELETE
  TO authenticated
  USING (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "Daily totals admins read org"
  ON sales_daily_totals FOR SELECT
  TO authenticated
  USING (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "Daily totals managers read org"
  ON sales_daily_totals FOR SELECT
  TO authenticated
  USING (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('manager', 'sales_manager', 'finance')
  );

CREATE POLICY "Sales users read own daily totals"
  ON sales_daily_totals FOR SELECT
  TO authenticated
  USING (
    sales_rep_id = auth.uid()
    AND organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Daily totals admins insert org"
  ON sales_daily_totals FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    AND EXISTS (
      SELECT 1 FROM sales_daily_reports r
      WHERE r.id = sales_daily_totals.report_id
        AND r.organization_id = sales_daily_totals.organization_id
    )
  );

CREATE POLICY "Daily totals admins update org"
  ON sales_daily_totals FOR UPDATE
  TO authenticated
  USING (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  )
  WITH CHECK (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    AND EXISTS (
      SELECT 1 FROM sales_daily_reports r
      WHERE r.id = sales_daily_totals.report_id
        AND r.organization_id = sales_daily_totals.organization_id
    )
  );

CREATE POLICY "Daily totals admins delete org"
  ON sales_daily_totals FOR DELETE
  TO authenticated
  USING (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

REVOKE UPDATE (organization_id, imported_by, created_at) ON sales_daily_reports FROM authenticated;
REVOKE UPDATE (organization_id, created_at) ON sales_daily_totals FROM authenticated;