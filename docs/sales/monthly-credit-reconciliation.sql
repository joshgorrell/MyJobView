-- Before rollout: verify dependencies and review actual source coverage.
SELECT table_name,column_name,data_type FROM information_schema.columns
WHERE table_schema='public' AND table_name IN ('contacts','invoices','sales_orders','profiles','recurring_subscriptions','security_contracts')
AND column_name ~* '(sales|rep|assign|owner|source|type|status|order|project|organization|date|total|tax)' ORDER BY table_name,column_name;
SELECT to_regclass('public.work_order_invoice_links') AS required_work_order_links,
 to_regprocedure('public.user_has_module_access(uuid,text)') AS required_permission_helper;
-- Source classification is reviewed independently of collection/payment status.
SELECT source_type,invoice_type,status,count(*) AS invoices,
 sum(coalesce(total-coalesce(tax_amount,0),subtotal,0)) AS before_tax_amount,
 count(*) FILTER(WHERE project_id IS NOT NULL OR nullif(to_jsonb(i)->>'sales_order_id','') IS NOT NULL) AS linked_project_billing
FROM public.invoices i GROUP BY source_type,invoice_type,status;
-- After rollout: retained historical transactions are explicit, never backfilled automatically.
SELECT kind,count(*) FROM sales_credit_private.legacy_sources GROUP BY kind;
SELECT * FROM sales_credit_private.coverage;
SELECT source_type,count(*) AS events,count(*) FILTER(WHERE credited_rep_id IS NULL) AS unassigned,
 sum(net_amount) AS net_credit FROM public.sales_performance_credits GROUP BY source_type;
-- Historical origins must be reviewed rather than copied from today's contact owner.
SELECT 'subscriptions' AS source,count(*) AS unverified FROM public.recurring_subscriptions WHERE sales_origin_snapshotted_at IS NULL
UNION ALL SELECT 'security_contracts',count(*) FROM public.security_contracts WHERE sales_origin_snapshotted_at IS NULL;
