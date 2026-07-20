
-- Upsert Bobbi Holthaus's 2026 monthly sales stats from Invoice Summary Report (1/1/26-7/20/26)
-- Totals exclude Void and $0.00 Billed invoices, grouped by invoice date month.
-- Grand total: $110,182.14 — matches report exactly.
INSERT INTO sales_monthly_stats (id, organization_id, user_id, year, month, total_sales, updated_at)
VALUES
  (gen_random_uuid(), 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15', '725d672e-b5ef-4048-9489-36b3b98ab8c7', 2026, 1, 15998.19, now()),
  (gen_random_uuid(), 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15', '725d672e-b5ef-4048-9489-36b3b98ab8c7', 2026, 2, 13101.53, now()),
  (gen_random_uuid(), 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15', '725d672e-b5ef-4048-9489-36b3b98ab8c7', 2026, 3, 15843.70, now()),
  (gen_random_uuid(), 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15', '725d672e-b5ef-4048-9489-36b3b98ab8c7', 2026, 4, 19838.73, now()),
  (gen_random_uuid(), 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15', '725d672e-b5ef-4048-9489-36b3b98ab8c7', 2026, 5, 15991.96, now()),
  (gen_random_uuid(), 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15', '725d672e-b5ef-4048-9489-36b3b98ab8c7', 2026, 6, 24291.07, now()),
  (gen_random_uuid(), 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15', '725d672e-b5ef-4048-9489-36b3b98ab8c7', 2026, 7,  5116.96, now())
ON CONFLICT (organization_id, user_id, year, month)
DO UPDATE SET
  total_sales = EXCLUDED.total_sales,
  updated_at  = now();

-- Update yearly_sales_performance to match the YTD total
INSERT INTO yearly_sales_performance (id, user_id, year, total_revenue, updated_at)
VALUES (gen_random_uuid(), '725d672e-b5ef-4048-9489-36b3b98ab8c7', 2026, 110182.14, now())
ON CONFLICT (user_id, year)
DO UPDATE SET
  total_revenue = EXCLUDED.total_revenue,
  updated_at    = now();
