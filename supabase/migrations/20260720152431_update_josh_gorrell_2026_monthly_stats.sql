-- Upsert Josh Gorrell's 2026 monthly sales stats from Invoice Summary Report (1/1/26-7/20/26)
-- Totals include all Billed/Past Due invoices, no Voids to exclude.
-- Grand total: $53,033.26 — matches report exactly.
INSERT INTO sales_monthly_stats (id, organization_id, user_id, year, month, total_sales, updated_at)
VALUES
  (gen_random_uuid(), 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15', 'b7a3a863-b230-4c54-a8d6-39b123a2924a', 2026, 1,  2304.46, now()),
  (gen_random_uuid(), 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15', 'b7a3a863-b230-4c54-a8d6-39b123a2924a', 2026, 2, 12272.24, now()),
  (gen_random_uuid(), 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15', 'b7a3a863-b230-4c54-a8d6-39b123a2924a', 2026, 3,  2920.91, now()),
  (gen_random_uuid(), 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15', 'b7a3a863-b230-4c54-a8d6-39b123a2924a', 2026, 4,  1865.54, now()),
  (gen_random_uuid(), 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15', 'b7a3a863-b230-4c54-a8d6-39b123a2924a', 2026, 5, 12216.56, now()),
  (gen_random_uuid(), 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15', 'b7a3a863-b230-4c54-a8d6-39b123a2924a', 2026, 6, 15247.50, now()),
  (gen_random_uuid(), 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15', 'b7a3a863-b230-4c54-a8d6-39b123a2924a', 2026, 7,  6206.05, now())
ON CONFLICT (organization_id, user_id, year, month)
DO UPDATE SET
  total_sales = EXCLUDED.total_sales,
  updated_at  = now();

INSERT INTO yearly_sales_performance (id, user_id, year, total_revenue, updated_at)
VALUES (gen_random_uuid(), 'b7a3a863-b230-4c54-a8d6-39b123a2924a', 2026, 53033.26, now())
ON CONFLICT (user_id, year)
DO UPDATE SET
  total_revenue = EXCLUDED.total_revenue,
  updated_at    = now();
