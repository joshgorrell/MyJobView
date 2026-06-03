/*
  # Create Sales Monthly Stats Table

  ## Summary
  Creates a table to store aggregated monthly sales statistics per user.
  This powers the monthly progress line graph on the sales dashboard.

  ## New Tables
  - `sales_monthly_stats`
    - `id` (uuid, primary key)
    - `organization_id` (uuid, FK to organizations)
    - `user_id` (uuid, FK to profiles)
    - `year` (int) - e.g. 2025
    - `month` (int) - 1-12
    - `total_sales` (numeric) - total revenue from approved sales orders that month
    - `sales_order_count` (int) - number of sales orders
    - `proposals_sent` (int) - proposals sent out that month
    - `proposals_approved` (int) - proposals approved that month
    - `created_at` / `updated_at` timestamps

  ## Security
  - RLS enabled
  - Users can read/insert/update their own rows
  - Admins, managers, finance can read all rows within org
*/

CREATE TABLE IF NOT EXISTS sales_monthly_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  year integer NOT NULL CHECK (year >= 2020 AND year <= 2100),
  month integer NOT NULL CHECK (month >= 1 AND month <= 12),
  total_sales numeric(12,2) NOT NULL DEFAULT 0,
  sales_order_count integer NOT NULL DEFAULT 0,
  proposals_sent integer NOT NULL DEFAULT 0,
  proposals_approved integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (organization_id, user_id, year, month)
);

ALTER TABLE sales_monthly_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own monthly stats"
  ON sales_monthly_stats FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Privileged roles can read all monthly stats in org"
  ON sales_monthly_stats FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.organization_id = sales_monthly_stats.organization_id
        AND profiles.role IN ('admin', 'manager', 'sales_manager', 'finance')
    )
  );

CREATE POLICY "Users can insert own monthly stats"
  ON sales_monthly_stats FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can insert any monthly stats"
  ON sales_monthly_stats FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.organization_id = sales_monthly_stats.organization_id
        AND profiles.role IN ('admin', 'manager', 'sales_manager')
    )
  );

CREATE POLICY "Users can update own monthly stats"
  ON sales_monthly_stats FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can update any monthly stats"
  ON sales_monthly_stats FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.organization_id = sales_monthly_stats.organization_id
        AND profiles.role IN ('admin', 'manager', 'sales_manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.organization_id = sales_monthly_stats.organization_id
        AND profiles.role IN ('admin', 'manager', 'sales_manager')
    )
  );

CREATE INDEX IF NOT EXISTS idx_sales_monthly_stats_user_id ON sales_monthly_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_sales_monthly_stats_org_id ON sales_monthly_stats(organization_id);
CREATE INDEX IF NOT EXISTS idx_sales_monthly_stats_year_month ON sales_monthly_stats(year, month);

CREATE OR REPLACE FUNCTION refresh_sales_monthly_stats(p_user_id uuid, p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT
      EXTRACT(YEAR FROM so.created_at)::int AS yr,
      EXTRACT(MONTH FROM so.created_at)::int AS mo,
      COALESCE(SUM(so.total_amount), 0) AS total_sales,
      COUNT(so.id) AS order_count
    FROM sales_orders so
    WHERE so.created_by = p_user_id
      AND so.organization_id = p_org_id
      AND so.status NOT IN ('cancelled', 'void')
    GROUP BY yr, mo
  LOOP
    INSERT INTO sales_monthly_stats (organization_id, user_id, year, month, total_sales, sales_order_count, updated_at)
    VALUES (p_org_id, p_user_id, rec.yr, rec.mo, rec.total_sales, rec.order_count, now())
    ON CONFLICT (organization_id, user_id, year, month)
    DO UPDATE SET
      total_sales = EXCLUDED.total_sales,
      sales_order_count = EXCLUDED.sales_order_count,
      updated_at = now();
  END LOOP;

  FOR rec IN
    SELECT
      EXTRACT(YEAR FROM p.created_at)::int AS yr,
      EXTRACT(MONTH FROM p.created_at)::int AS mo,
      COUNT(*) FILTER (WHERE p.status IN ('sent', 'viewed', 'portal', 'approved', 'accepted')) AS sent_count,
      COUNT(*) FILTER (WHERE p.status IN ('approved', 'accepted')) AS approved_count
    FROM proposals p
    WHERE p.created_by = p_user_id
      AND p.organization_id = p_org_id
    GROUP BY yr, mo
  LOOP
    INSERT INTO sales_monthly_stats (organization_id, user_id, year, month, proposals_sent, proposals_approved, updated_at)
    VALUES (p_org_id, p_user_id, rec.yr, rec.mo, rec.sent_count, rec.approved_count, now())
    ON CONFLICT (organization_id, user_id, year, month)
    DO UPDATE SET
      proposals_sent = EXCLUDED.proposals_sent,
      proposals_approved = EXCLUDED.proposals_approved,
      updated_at = now();
  END LOOP;
END;
$$;
