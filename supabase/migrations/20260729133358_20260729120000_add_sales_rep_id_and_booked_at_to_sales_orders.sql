/*
# Add sales_rep_id and booked_at to sales_orders

1. Changes
  - Add `sales_rep_id` (uuid, references profiles) to `sales_orders`.
    This is the authoritative sales-credit column going forward.
    `created_by` remains as a legacy fallback for rows created before this migration.
  - Add `booked_at` (timestamptz) to `sales_orders`.
    This is the authoritative booked-sales date. Falls back to `created_at` for legacy rows.
  - Backfill `sales_rep_id` from `created_by` where `sales_rep_id IS NULL`.
    Never overwrites an existing non-null `sales_rep_id`.
  - Backfill `booked_at` from the linked proposal's approval timestamp where available,
    else from `created_at`.
  - Add a trigger to auto-populate `sales_rep_id` from `created_by` on INSERT
    when the caller does not supply an explicit `sales_rep_id`.

2. New Columns
  - `sales_orders.sales_rep_id` uuid REFERENCES profiles(id) ON DELETE SET NULL
  - `sales_orders.booked_at` timestamptz

3. Indexes
  - `idx_sales_orders_rep_booked` on (sales_rep_id, booked_at) — primary query path for rep-scoped booked sales
  - `idx_sales_orders_created_by_booked_null_rep` partial index on (created_by, booked_at) WHERE sales_rep_id IS NULL — legacy fallback path
  - `idx_proposals_rep_status_created` on proposals (created_by, status, created_at) — pipeline and close-rate queries
  - `idx_sales_monthly_stats_user_period` on sales_monthly_stats (user_id, year, month) — quota attainment lookups

4. Security
  - No RLS policy changes in this migration. Existing company-based RLS on sales_orders remains.
    A follow-up migration will add rep-scoped RLS policies.
  - The backfill is data-only and does not destroy or rename any existing columns.

5. Important Notes
  - `created_by` is NOT dropped or renamed. It remains as the audit column for who created the record.
  - The sales-credit rule going forward is: CASE WHEN sales_rep_id IS NOT NULL THEN sales_rep_id ELSE created_by END
  - The booked-date rule going forward is: COALESCE(booked_at, created_at)
*/

-- ── Step 1: Add columns ──────────────────────────────────────────────
ALTER TABLE sales_orders
  ADD COLUMN IF NOT EXISTS sales_rep_id uuid REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE sales_orders
  ADD COLUMN IF NOT EXISTS booked_at timestamptz;

-- ── Step 2: Backfill sales_rep_id from created_by ────────────────────
UPDATE sales_orders
SET sales_rep_id = created_by
WHERE sales_rep_id IS NULL;

-- ── Step 3: Backfill booked_at ───────────────────────────────────────
-- First try to pull the approval timestamp from the linked proposal.
UPDATE sales_orders so
SET booked_at = sub.approved_at
FROM (
  SELECT p.id AS proposal_id, MAX(pah.created_at) AS approved_at
  FROM proposals p
  JOIN proposal_activity pah
    ON pah.proposal_id = p.id
   AND pah.activity_type = 'approved'
  WHERE p.status IN ('approved', 'approved_pending_action')
  GROUP BY p.id
) sub
WHERE so.proposal_id = sub.proposal_id
  AND so.booked_at IS NULL
  AND sub.approved_at IS NOT NULL;

-- Fallback: use created_at for any rows still missing booked_at
UPDATE sales_orders
SET booked_at = created_at
WHERE booked_at IS NULL;

-- ── Step 4: Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sales_orders_rep_booked
  ON sales_orders (sales_rep_id, booked_at);

CREATE INDEX IF NOT EXISTS idx_sales_orders_created_by_booked_null_rep
  ON sales_orders (created_by, booked_at)
  WHERE sales_rep_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_proposals_rep_status_created
  ON proposals (created_by, status, created_at);

CREATE INDEX IF NOT EXISTS idx_sales_monthly_stats_user_period
  ON sales_monthly_stats (user_id, year, month);

-- ── Step 5: Auto-populate sales_rep_id on insert ─────────────────────
CREATE OR REPLACE FUNCTION set_sales_order_sales_rep_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.sales_rep_id IS NULL THEN
    NEW.sales_rep_id := NEW.created_by;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_sales_order_sales_rep_id ON sales_orders;
CREATE TRIGGER trg_set_sales_order_sales_rep_id
  BEFORE INSERT ON sales_orders
  FOR EACH ROW
  EXECUTE FUNCTION set_sales_order_sales_rep_id();
