/*
  # Create Historical Sales Monthly Stats Table

  ## Purpose
  Stores pre-aggregated monthly sales statistics imported from the Electronic Life
  historical Excel export (2020–2026). This table feeds the Sales Dashboard's
  Historical Performance section, providing a continuous data line from 2020 through
  the present alongside live invoice data.

  ## New Tables

  ### `sales_history_monthly`
  Pre-aggregated monthly sales stats imported from external sources.

  Columns:
  - `id` — UUID primary key
  - `organization_id` — FK to organizations (multi-tenant)
  - `sales_rep_id` — FK to profiles (nullable: null = company aggregate row)
  - `sales_rep_name` — snapshot of rep name at import time
  - `sales_rep_initials` — original initials from source file (JG, BH, AK, MC, JN)
  - `stat_year` — calendar year (e.g., 2023)
  - `stat_month` — calendar month 1–12
  - `stat_quarter` — computed quarter 1–4
  - `month_start_date` — first day of the month (DATE)
  - `invoice_total` — sum of all invoices for rep/month (numeric 12,2)
  - `invoice_count` — number of invoices for rep/month
  - `yoy_change_percent` — year-over-year % change vs same month prior year (nullable)
  - `quarter_total` — quarterly total for the rep (nullable, pre-computed from source)
  - `import_batch_id` — UUID identifying the import run; used for rollback
  - `source_type` — always 'historical_import' for rows from this feature
  - `created_at`, `imported_at` — timestamps

  ## Constraints
  - `UNIQUE(organization_id, sales_rep_id, stat_year, stat_month)` — prevents
    duplicate month rows per rep. On re-import, all existing rows with
    `source_type = 'historical_import'` are deleted first, then rows inserted.
    The unique constraint serves as a safety net.

  ## Indexes
  - `(organization_id, stat_year, stat_month)` — fast monthly range scans for dashboards
  - `(organization_id, sales_rep_id, stat_year)` — fast rep-year history queries
  - `(organization_id, import_batch_id)` — fast rollback queries

  ## Security
  - RLS enabled; restrictive by default
  - Admin/manager/sales_manager/finance roles can read all org rows
  - Reps can read only their own rows (sales_rep_id = auth.uid())
  - Only admins can insert/update/delete (import is admin-only)
*/

CREATE TABLE IF NOT EXISTS sales_history_monthly (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sales_rep_id         uuid REFERENCES profiles(id) ON DELETE SET NULL,
  sales_rep_name       text NOT NULL DEFAULT '',
  sales_rep_initials   text NOT NULL DEFAULT '',
  stat_year            integer NOT NULL CHECK (stat_year >= 2000 AND stat_year <= 2100),
  stat_month           integer NOT NULL CHECK (stat_month >= 1 AND stat_month <= 12),
  stat_quarter         integer NOT NULL GENERATED ALWAYS AS (CEIL(stat_month::numeric / 3)::integer) STORED,
  month_start_date     date NOT NULL,
  invoice_total        numeric(12, 2) NOT NULL DEFAULT 0,
  invoice_count        integer NOT NULL DEFAULT 0,
  yoy_change_percent   numeric(8, 2),
  quarter_total        numeric(12, 2),
  import_batch_id      uuid NOT NULL,
  source_type          text NOT NULL DEFAULT 'historical_import',
  created_at           timestamptz NOT NULL DEFAULT now(),
  imported_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sales_history_monthly_unique_rep_month
    UNIQUE (organization_id, sales_rep_id, stat_year, stat_month),

  CONSTRAINT sales_history_monthly_source_type_check
    CHECK (source_type IN ('historical_import', 'manual_entry'))
);

-- Indexes for dashboard performance
CREATE INDEX IF NOT EXISTS idx_sales_history_monthly_org_year_month
  ON sales_history_monthly (organization_id, stat_year, stat_month);

CREATE INDEX IF NOT EXISTS idx_sales_history_monthly_org_rep_year
  ON sales_history_monthly (organization_id, sales_rep_id, stat_year);

CREATE INDEX IF NOT EXISTS idx_sales_history_monthly_import_batch
  ON sales_history_monthly (organization_id, import_batch_id);

CREATE INDEX IF NOT EXISTS idx_sales_history_monthly_source_type
  ON sales_history_monthly (organization_id, source_type);

-- Enable RLS
ALTER TABLE sales_history_monthly ENABLE ROW LEVEL SECURITY;

-- Admins, managers, sales_managers, and finance can read all org rows
CREATE POLICY "Admin and manager roles can read org historical sales"
  ON sales_history_monthly FOR SELECT
  TO authenticated
  USING (
    organization_id = (
      SELECT organization_id FROM profiles
      WHERE id = auth.uid()
    )
    AND (
      SELECT role FROM profiles WHERE id = auth.uid()
    ) IN ('admin', 'manager', 'sales_manager', 'finance')
  );

-- Sales reps can read only their own rows
CREATE POLICY "Sales reps can read own historical sales"
  ON sales_history_monthly FOR SELECT
  TO authenticated
  USING (
    sales_rep_id = auth.uid()
    AND organization_id = (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Only admins can insert
CREATE POLICY "Admins can insert historical sales"
  ON sales_history_monthly FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id = (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
    AND (
      SELECT role FROM profiles WHERE id = auth.uid()
    ) = 'admin'
  );

-- Only admins can update
CREATE POLICY "Admins can update historical sales"
  ON sales_history_monthly FOR UPDATE
  TO authenticated
  USING (
    organization_id = (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
    AND (
      SELECT role FROM profiles WHERE id = auth.uid()
    ) = 'admin'
  )
  WITH CHECK (
    organization_id = (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
    AND (
      SELECT role FROM profiles WHERE id = auth.uid()
    ) = 'admin'
  );

-- Only admins can delete (rollback)
CREATE POLICY "Admins can delete historical sales"
  ON sales_history_monthly FOR DELETE
  TO authenticated
  USING (
    organization_id = (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
    AND (
      SELECT role FROM profiles WHERE id = auth.uid()
    ) = 'admin'
  );
