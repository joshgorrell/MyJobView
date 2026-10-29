-- Accept the live invoice schema's standard/manual standalone classification.
-- Deposit, progress, final, change-order and project-linked invoices remain excluded.
CREATE OR REPLACE FUNCTION sales_credit_private.invoice_total(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE i public.invoices%ROWTYPE;j jsonb;rep uuid;v_net numeric;kind text:='retail_invoice';reason text:='customer_owner_at_invoice_posting';eligible boolean;recurring boolean;allocation jsonb:='[]';a record;s sales_credit_private.streams%ROWTYPE;
BEGIN
 IF EXISTS(SELECT 1 FROM sales_credit_private.legacy_sources ls WHERE ls.kind='invoice' AND id=p_id) THEN RETURN;END IF;
 SELECT * INTO i FROM public.invoices WHERE id=p_id FOR UPDATE;IF NOT FOUND THEN RETURN;END IF;
 j:=to_jsonb(i);eligible:=i.status IN ('sent','submitted','partial','paid','overdue');v_net:=coalesce(i.total-coalesce(i.tax_amount,0),i.subtotal,0);
 IF nullif(j->>'sales_order_id','') IS NOT NULL OR nullif(j->>'proposal_id','') IS NOT NULL OR coalesce((j->>'billed_from_proposal')::boolean,false)
 OR lower(coalesce(i.invoice_type,'')) IN ('deposit','progress','final','project','change_order','credit','credit_note')
 OR lower(coalesce(i.source_type,'')) IN ('deposit','progress','final','project','change_order','credit','credit_note')
 OR EXISTS(SELECT 1 FROM public.projects p WHERE p.id=i.project_id AND p.organization_id=i.organization_id AND p.sales_order_id IS NOT NULL) THEN eligible:=false;END IF;
 SELECT assigned_to INTO rep FROM public.contacts WHERE id=i.contact_id AND organization_id=i.organization_id;
 recurring:=lower(coalesce(i.invoice_type,''))='recurring' OR lower(coalesce(i.source_type,'')) IN ('recurring','subscription','security_monitoring')
 OR EXISTS(SELECT 1 FROM public.recurring_invoices r WHERE r.invoice_id=i.id AND r.organization_id=i.organization_id);
 IF nullif(j->>'security_billing_cycle_id','') IS NOT NULL THEN
  rep:=NULL;kind:='recurring_invoice';reason:='security_contract_origin_snapshot';
  SELECT c.originating_sales_rep_id INTO rep FROM public.security_billing_cycles b JOIN public.security_contracts c ON c.id=b.contract_id AND c.organization_id=b.organization_id
   WHERE b.id=(j->>'security_billing_cycle_id')::uuid AND b.organization_id=i.organization_id AND c.contact_id=i.contact_id AND c.sales_origin_snapshotted_at IS NOT NULL;
 ELSIF recurring THEN
  kind:='recurring_invoice';
  IF EXISTS(SELECT 1 FROM public.recurring_invoices r WHERE r.invoice_id=i.id GROUP BY r.subscription_id HAVING count(*)>1) THEN RAISE EXCEPTION 'Duplicate subscription billing links';END IF;
  IF EXISTS(SELECT 1 FROM public.recurring_invoices r LEFT JOIN public.recurring_subscriptions sub ON sub.id=r.subscription_id WHERE r.invoice_id=i.id AND (r.organization_id IS DISTINCT FROM i.organization_id OR sub.organization_id IS DISTINCT FROM i.organization_id OR sub.contact_id IS DISTINCT FROM i.contact_id OR r.amount<0)) THEN RAISE EXCEPTION 'Subscription source mismatch';END IF;
  IF eligible THEN
   WITH weights AS(SELECT r.subscription_id,sub.originating_sales_rep_id,sub.sales_origin_snapshotted_at,r.amount,sum(r.amount)OVER() AS gross
    FROM public.recurring_invoices r JOIN public.recurring_subscriptions sub ON sub.id=r.subscription_id WHERE r.invoice_id=i.id AND r.amount>0 AND r.organization_id=i.organization_id),
   cents AS(SELECT *,floor(round(v_net*100)*amount/nullif(gross,0)) AS base,round(v_net*100)*amount/nullif(gross,0)-floor(round(v_net*100)*amount/nullif(gross,0)) AS fraction FROM weights),
   ranked AS(SELECT *,row_number()OVER(ORDER BY fraction DESC,subscription_id::text)AS n,round(v_net*100)-sum(base)OVER()AS remaining FROM cents)
   SELECT coalesce(jsonb_agg(jsonb_build_object('key','subscription:'||i.id||':'||subscription_id,'rep',originating_sales_rep_id,'amount',(base+CASE WHEN n<=remaining THEN 1 ELSE 0 END)/100,'reason',CASE WHEN sales_origin_snapshotted_at IS NULL THEN 'subscription_origin_unverified' ELSE 'subscription_origin_snapshot' END)),'[]') INTO allocation FROM ranked;
  END IF;
  eligible:=false;
 ELSIF nullif(j->>'work_order_billing_request_id','') IS NOT NULL OR EXISTS(SELECT 1 FROM public.invoice_line_item_sources l JOIN public.invoice_line_items li ON li.id=l.invoice_line_item_id AND li.organization_id=l.organization_id WHERE li.invoice_id=i.id AND l.organization_id=i.organization_id AND l.source_type='work_order') THEN kind:='service_invoice';
 ELSIF lower(coalesce(i.invoice_type,'')) NOT IN ('standard','retail','service','time_and_materials') AND lower(coalesce(i.source_type,'')) NOT IN ('manual','retail','service','time_and_materials') THEN eligible:=false;END IF;
 IF eligible THEN allocation:=jsonb_build_array(jsonb_build_object('key','invoice:'||i.id,'rep',rep,'amount',v_net,'reason',reason));END IF;
 FOR s IN SELECT * FROM sales_credit_private.streams st WHERE st.organization_id=i.organization_id AND st.source_id=i.id AND st.source_type<>'sales_order' LOOP
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(allocation)x WHERE x->>'key'=s.stream_key) THEN PERFORM sales_credit_private.apply_total(s.organization_id,s.stream_key,i.id,s.source_type,s.customer_id,s.credited_rep_id,s.attribution_reason,0,now());END IF;
 END LOOP;
 FOR a IN SELECT * FROM jsonb_to_recordset(allocation)AS x(key text,rep uuid,amount numeric,reason text) LOOP
  PERFORM sales_credit_private.apply_total(i.organization_id,a.key,i.id,kind,i.contact_id,a.rep,a.reason,a.amount,now());
 END LOOP;
END $$;
