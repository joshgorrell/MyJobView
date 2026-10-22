-- Reconciliation gate before enabling invoice posting. Run in SQL editor.
-- Shows which ownership and classification columns exist in the deployed schema.
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name IN ('contacts','invoices','sales_orders','profiles')
  AND (column_name ~* '(sales|rep|assign|owner|source|type|status|order|project|organization|date|total|subtotal|tax)')
ORDER BY table_name, column_name;

-- How many finalized invoices can be safely classified?
SELECT COALESCE(source_type::text,'<null>') AS source_type,
       COALESCE(invoice_type::text,'<null>') AS invoice_type,
       status, COUNT(*) AS invoices,
       SUM(COALESCE(subtotal, total-COALESCE(tax_amount,0))) AS net_amount,
       COUNT(*) FILTER (WHERE project_id IS NOT NULL) AS project_linked,
       COUNT(*) FILTER (WHERE work_order_billing_request_id IS NOT NULL) AS work_order_linked
FROM public.invoices
GROUP BY 1,2,3
ORDER BY 1,2,3;

-- Orders that have related invoices must count once for project booked credit.
SELECT so.id AS sales_order_id, so.order_number, so.contract_total,
       COUNT(DISTINCT i.id) AS linked_invoices,
       SUM(COALESCE(i.subtotal, i.total-COALESCE(i.tax_amount,0))) AS linked_net_invoice_amount
FROM public.sales_orders so
JOIN public.projects p ON p.sales_order_id=so.id
JOIN public.invoices i ON i.project_id=p.id
GROUP BY so.id, so.order_number, so.contract_total
ORDER BY linked_invoices DESC
LIMIT 100;

-- Check credit events for duplicates or unexplained unassigned credit.
SELECT source_type, COUNT(*) AS events,
       COUNT(*) FILTER (WHERE credited_rep_id IS NULL) AS unassigned,
       SUM(net_amount) AS net_credit
FROM public.sales_performance_credits
GROUP BY source_type;
