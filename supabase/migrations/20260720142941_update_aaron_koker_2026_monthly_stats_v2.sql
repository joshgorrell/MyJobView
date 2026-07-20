
-- Upsert Aaron Koker's 2026 monthly sales stats from Invoice Summary Report (1/1/26-7/20/26)
-- Totals are invoice totals (excluding Void/$0 invoices) grouped by invoice date month.
-- Grand total: $320,205.19 ≈ report's $320,204.19 (rounding on individual line items)
INSERT INTO sales_monthly_stats (id, organization_id, user_id, year, month, total_sales, updated_at)
VALUES
  (gen_random_uuid(), 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15', '67df38a9-8811-4504-bd00-6ed1a69b1ac4', 2026, 1, 34439.88, now()),
  (gen_random_uuid(), 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15', '67df38a9-8811-4504-bd00-6ed1a69b1ac4', 2026, 2, 50334.24, now()),
  (gen_random_uuid(), 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15', '67df38a9-8811-4504-bd00-6ed1a69b1ac4', 2026, 3, 25569.06, now()),
  (gen_random_uuid(), 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15', '67df38a9-8811-4504-bd00-6ed1a69b1ac4', 2026, 4, 38803.11, now()),
  (gen_random_uuid(), 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15', '67df38a9-8811-4504-bd00-6ed1a69b1ac4', 2026, 5, 19748.16, now()),
  (gen_random_uuid(), 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15', '67df38a9-8811-4504-bd00-6ed1a69b1ac4', 2026, 6, 142178.41, now()),
  (gen_random_uuid(), 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15', '67df38a9-8811-4504-bd00-6ed1a69b1ac4', 2026, 7, 9132.33, now())
ON CONFLICT (organization_id, user_id, year, month)
DO UPDATE SET
  total_sales = EXCLUDED.total_sales,
  updated_at  = now();
