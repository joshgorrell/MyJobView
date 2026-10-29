-- Read-only checks after the new migration. Run as an authorized operator.
-- A. Every stream's cached net must equal its immutable event history.
SELECT s.organization_id,s.stream_key,s.net_total,coalesce(sum(e.net_amount),0) AS event_total
FROM sales_credit_private.streams s LEFT JOIN public.sales_performance_credits e
 ON e.organization_id=s.organization_id AND e.stream_key=s.stream_key
GROUP BY s.organization_id,s.stream_key,s.net_total
HAVING s.net_total<>coalesce(sum(e.net_amount),0);
-- B. Voided invoices must have zero net performance credit, not deleted history.
SELECT i.id,i.invoice_number,i.status,sum(e.net_amount) AS residual_credit
FROM public.invoices i JOIN public.sales_performance_credits e ON e.source_id=i.id AND e.organization_id=i.organization_id
WHERE i.status IN ('void','voided','cancelled') AND e.stream_key NOT LIKE 'order:%'
GROUP BY i.id,i.invoice_number,i.status HAVING sum(e.net_amount)<>0;
-- C. Attribution coverage remains explicit.
SELECT attribution_reason,count(*) AS events,sum(net_amount) AS credited FROM public.sales_performance_credits GROUP BY attribution_reason;
-- D. Current recurring links must be unique per invoice/subscription.
SELECT invoice_id,subscription_id,count(*) FROM public.recurring_invoices GROUP BY invoice_id,subscription_id HAVING count(*)>1;
-- E. No client may directly call privileged posting functions.
SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='sales_credit_private' AND has_function_privilege('authenticated',p.oid,'EXECUTE');
