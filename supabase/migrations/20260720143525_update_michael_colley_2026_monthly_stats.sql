
-- Upsert Michael Colley's 2026 monthly sales stats from Invoice Summary Report (1/1/26-7/20/26)
-- Totals are invoice totals (excluding Void/$0 invoices) grouped by invoice date month.
-- Grand total: $539,849.59 — matches report exactly.
INSERT INTO sales_monthly_stats (id, organization_id, user_id, year, month, total_sales, updated_at)
VALUES
  (gen_random_uuid(), 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15', 'ba6576f4-4b4d-4b29-bf60-6fd705bd9082', 2026, 1, 158373.54, now()),
  (gen_random_uuid(), 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15', 'ba6576f4-4b4d-4b29-bf60-6fd705bd9082', 2026, 2,  36517.73, now()),
  (gen_random_uuid(), 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15', 'ba6576f4-4b4d-4b29-bf60-6fd705bd9082', 2026, 3,  85921.83, now()),
  (gen_random_uuid(), 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15', 'ba6576f4-4b4d-4b29-bf60-6fd705bd9082', 2026, 4,  93727.25, now()),
  (gen_random_uuid(), 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15', 'ba6576f4-4b4d-4b29-bf60-6fd705bd9082', 2026, 5,  76083.77, now()),
  (gen_random_uuid(), 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15', 'ba6576f4-4b4d-4b29-bf60-6fd705bd9082', 2026, 6,  50157.55, now()),
  (gen_random_uuid(), 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15', 'ba6576f4-4b4d-4b29-bf60-6fd705bd9082', 2026, 7,  39067.92, now())
ON CONFLICT (organization_id, user_id, year, month)
DO UPDATE SET
  total_sales = EXCLUDED.total_sales,
  updated_at  = now();

-- Update yearly_sales_performance to match the YTD total
INSERT INTO yearly_sales_performance (id, user_id, year, total_revenue, updated_at)
VALUES (gen_random_uuid(), 'ba6576f4-4b4d-4b29-bf60-6fd705bd9082', 2026, 539849.59, now())
ON CONFLICT (user_id, year)
DO UPDATE SET
  total_revenue = EXCLUDED.total_revenue,
  updated_at    = now();
