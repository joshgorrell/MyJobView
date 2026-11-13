-- Read-only deployment gate. Run against target database BEFORE enabling
-- Sales Order billing. Every required object must be present.
WITH required_objects(object_name, present) AS (
 VALUES
 ('sales_order_billing_rows', to_regclass('public.sales_order_billing_rows') IS NOT NULL),
 ('sales_order_billing_row_allocations', to_regclass('public.sales_order_billing_row_allocations') IS NOT NULL),
 ('sales_order_billing_row_balances', to_regclass('public.sales_order_billing_row_balances') IS NOT NULL),
 ('atomic_invoice_rpc', to_regprocedure('public.create_sales_order_invoice_atomic(jsonb,jsonb,jsonb,jsonb,jsonb)') IS NOT NULL),
 ('invoice_contract_cap_guard', to_regprocedure('public.guard_sales_order_invoice_contract_cap()') IS NOT NULL),
 ('billing_allocation_guard', to_regprocedure('public.guard_sales_order_billing_allocation()') IS NOT NULL)
)
SELECT object_name, CASE WHEN present THEN 'READY' ELSE 'MISSING' END AS status
FROM required_objects ORDER BY object_name;

-- Inspect trigger installation without modifying customer records.
SELECT c.relname AS table_name, t.tgname AS trigger_name
FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND NOT t.tgisinternal
AND (t.tgname ILIKE '%billing%' OR t.tgname ILIKE '%invoice_contract%')
ORDER BY c.relname, t.tgname;
