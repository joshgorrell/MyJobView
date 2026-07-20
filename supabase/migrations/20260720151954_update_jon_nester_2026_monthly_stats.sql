-- Upsert Jon Nester's 2026 monthly sales stats from Invoice Summary Report (1/1/26-7/20/26)
-- Totals exclude Void invoices, grouped by invoice date month.
-- Grand total: $156,195.56 — matches report exactly.
INSERT INTO sales_monthly_stats (id, organization_id, user_id, year, month, total_sales, updated_at)
VALUES
  (gen_random_uuid(), 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15', 'f44449cd-5dbf-4a25-9a00-ba9431df5476', 2026, 1, 37041.58, now()),
  (gen_random_uuid(), 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15', 'f44449cd-5dbf-4a25-9a00-ba9431df5476', 2026, 2, 14154.81, now()),
  (gen_random_uuid(), 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15', 'f44449cd-5dbf-4a25-9a00-ba9431df5476', 2026, 3, 16330.01, now()),
  (gen_random_uuid(), 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15', 'f44449cd-5dbf-4a25-9a00-ba9431df5476', 2026, 4, 52935.80, now()),
  (gen_random_uuid(), 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15', 'f44449cd-5dbf-4a25-9a00-ba9431df5476', 2026, 5, 28027.23, now()),
  (gen_random_uuid(), 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15', 'f44449cd-5dbf-4a25-9a00-ba9431df5476', 2026, 6,  4272.91, now()),
  (gen_random_uuid(), 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15', 'f44449cd-5dbf-4a25-9a00-ba9431df5476', 2026, 7,  3433.22, now())
ON CONFLICT (organization_id, user_id, year, month)
DO UPDATE SET
  total_sales = EXCLUDED.total_sales,
  updated_at  = now();

INSERT INTO yearly_sales_performance (id, user_id, year, total_revenue, updated_at)
VALUES (gen_random_uuid(), 'f44449cd-5dbf-4a25-9a00-ba9431df5476', 2026, 156195.56, now())
ON CONFLICT (user_id, year)
DO UPDATE SET
  total_revenue = EXCLUDED.total_revenue,
  updated_at    = now();
