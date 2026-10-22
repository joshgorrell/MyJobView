-- Audit credit integrity before enabling monthly competition in production.
-- Each query should be reviewed; none changes data.

-- A. Posted invoice credit must never duplicate a subscription allocation.
SELECT organization_id,source_id,COUNT(*) AS event_count,
       SUM(net_amount) AS credited_net
FROM public.sales_performance_credits
WHERE source_type='recurring_invoice'
GROUP BY organization_id,source_id
HAVING COUNT(*)>1
   AND COUNT(*) FILTER (WHERE source_event_key LIKE 'invoice:posted:%')>0;

-- B. For subscription-linked invoices, allocated credit should equal the
-- actual pretax invoice subtotal (not the undiscounted sum of subscriptions).
SELECT i.id,i.invoice_number,i.status,i.subtotal,
       COALESCE(SUM(c.net_amount),0) AS allocated,
       i.subtotal-COALESCE(SUM(c.net_amount),0) AS difference
FROM public.invoices i
JOIN public.recurring_invoices ri ON ri.invoice_id=i.id
LEFT JOIN public.sales_performance_credits c
  ON c.organization_id=i.organization_id
 AND c.source_event_key='subscription_billing:'||ri.id::text
WHERE i.status IN ('sent','submitted','partial','paid','overdue')
GROUP BY i.id,i.invoice_number,i.status,i.subtotal
HAVING ABS(i.subtotal-COALESCE(SUM(c.net_amount),0))>0.01;

-- C. Find events recorded after the source invoice was voided/cancelled.
SELECT c.id,c.source_event_key,c.net_amount,i.status,i.invoice_number
FROM public.sales_performance_credits c
JOIN public.invoices i ON i.id=c.source_id AND i.organization_id=c.organization_id
WHERE c.source_type IN ('service_invoice','retail_invoice','recurring_invoice')
  AND i.status IN ('void','voided','cancelled');

-- D. Show potential credit misattribution for review.
SELECT c.attribution_reason,COUNT(*) AS events,SUM(c.net_amount) AS credited
FROM public.sales_performance_credits c
GROUP BY c.attribution_reason ORDER BY events DESC;
