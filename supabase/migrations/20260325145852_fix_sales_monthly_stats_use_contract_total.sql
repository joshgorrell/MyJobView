/*
  # Fix refresh_sales_monthly_stats RPC Function

  ## Summary
  The original function referenced `so.total_amount` which does not exist on the
  `sales_orders` table. The correct column is `contract_total`. This caused all
  monthly sales aggregations to return zero, making the Sales Dashboard charts
  empty for all users including admins.

  ## Changes
  - Replaced `so.total_amount` with `so.contract_total` in the aggregation query
  - No schema changes; function logic is identical otherwise
*/

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
      COALESCE(SUM(so.contract_total), 0) AS total_sales,
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
