-- Prospective performance credit only. No cash/commission/account-credit writes.
CREATE SCHEMA sales_credit_private;
REVOKE ALL ON SCHEMA sales_credit_private FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE sales_credit_private.coverage(started_at timestamptz NOT NULL DEFAULT now());
INSERT INTO sales_credit_private.coverage DEFAULT VALUES;
CREATE TABLE sales_credit_private.legacy_sources(kind text,id uuid,PRIMARY KEY(kind,id));
INSERT INTO sales_credit_private.legacy_sources SELECT 'order',id FROM public.sales_orders UNION ALL SELECT 'invoice',id FROM public.invoices;
CREATE TABLE sales_credit_private.streams(
 organization_id uuid NOT NULL,stream_key text NOT NULL,source_id uuid NOT NULL,source_type text NOT NULL,
 customer_id uuid,credited_rep_id uuid,attribution_reason text NOT NULL,net_total numeric(14,2) NOT NULL DEFAULT 0,
 revision integer NOT NULL DEFAULT 0,first_event_id uuid,PRIMARY KEY(organization_id,stream_key));
CREATE TABLE public.sales_performance_credits(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,credited_rep_id uuid,customer_id uuid,
 source_type text NOT NULL CHECK(source_type IN ('sales_order','service_invoice','retail_invoice','recurring_invoice','adjustment')),
 source_id uuid NOT NULL,source_event_key text NOT NULL,stream_key text NOT NULL,effective_at timestamptz NOT NULL,
 net_amount numeric(14,2) NOT NULL CHECK(net_amount<>'NaN'::numeric),adjustment_of_id uuid REFERENCES public.sales_performance_credits(id),
 attribution_reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(organization_id,source_event_key));
CREATE INDEX sales_credit_rep_period ON public.sales_performance_credits(organization_id,credited_rep_id,effective_at,id);
CREATE INDEX sales_credit_stream_source ON sales_credit_private.streams(organization_id,source_id);
ALTER TABLE public.sales_performance_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_credit_private.coverage ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_credit_private.legacy_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_credit_private.streams ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sales_performance_credits FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON ALL TABLES IN SCHEMA sales_credit_private FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION sales_credit_private.immutable_event() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'Performance events are immutable; use an adjustment'; END $$;
CREATE TRIGGER immutable_sales_credit BEFORE UPDATE OR DELETE ON public.sales_performance_credits FOR EACH ROW EXECUTE FUNCTION sales_credit_private.immutable_event();

CREATE FUNCTION sales_credit_private.apply_total(p_org uuid,p_key text,p_id uuid,p_type text,p_customer uuid,p_rep uuid,p_reason text,p_total numeric,p_at timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s sales_credit_private.streams%ROWTYPE; delta numeric; event uuid;
BEGIN
 IF p_org IS NULL OR p_total IS NULL OR p_total::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Invalid performance source'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.contacts c WHERE c.id=p_customer AND c.organization_id=p_org) AND NOT EXISTS(SELECT 1 FROM sales_credit_private.streams existing WHERE existing.organization_id=p_org AND existing.stream_key=p_key) THEN RAISE EXCEPTION 'Performance customer tenant mismatch'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=p_rep AND p.organization_id=p_org AND p.is_sales_rep AND p.is_active) THEN p_rep:=NULL; END IF;
 INSERT INTO sales_credit_private.streams(organization_id,stream_key,source_id,source_type,customer_id,credited_rep_id,attribution_reason)
 SELECT p_org,p_key,p_id,p_type,p_customer,p_rep,p_reason WHERE p_total<>0 ON CONFLICT DO NOTHING;
 SELECT * INTO s FROM sales_credit_private.streams WHERE organization_id=p_org AND stream_key=p_key FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 IF s.source_id<>p_id OR s.customer_id IS DISTINCT FROM p_customer THEN RAISE EXCEPTION 'Posted performance source identity is immutable';END IF;
 delta:=round(p_total,2)-s.net_total;IF delta=0 THEN RETURN;END IF;
 event:=gen_random_uuid();
 INSERT INTO public.sales_performance_credits(id,organization_id,credited_rep_id,customer_id,source_type,source_id,source_event_key,stream_key,effective_at,net_amount,adjustment_of_id,attribution_reason)
 VALUES(event,p_org,s.credited_rep_id,s.customer_id,CASE WHEN s.revision=0 THEN s.source_type ELSE 'adjustment' END,p_id,p_key||':'||(s.revision+1),p_key,
 CASE WHEN s.revision=0 THEN least(coalesce(p_at,now()),now()) ELSE now() END,delta,s.first_event_id,s.attribution_reason);
 UPDATE sales_credit_private.streams SET net_total=round(p_total,2),revision=s.revision+1,first_event_id=coalesce(s.first_event_id,event) WHERE organization_id=p_org AND stream_key=p_key;
END $$;

CREATE FUNCTION sales_credit_private.order_total(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.sales_orders%ROWTYPE;p public.proposals%ROWTYPE;rep uuid;tax numeric;desired numeric:=0;
BEGIN
 IF EXISTS(SELECT 1 FROM sales_credit_private.legacy_sources ls WHERE ls.kind='order' AND id=p_id) THEN RETURN;END IF;
 SELECT * INTO o FROM public.sales_orders WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RETURN;END IF;
 SELECT * INTO p FROM public.proposals WHERE id=o.proposal_id AND organization_id=o.organization_id AND contact_id=o.contact_id;
 IF o.status IN ('pending_deposit','pending_po','planning','active','complete','closed','completed') AND p.status IN ('approved','approved_pending_action','accepted') THEN
  SELECT coalesce(sum(CASE WHEN c.change_amount<0 THEN -abs(coalesce(c.tax_amount,0)) ELSE coalesce(c.tax_amount,0) END),0)
  INTO tax FROM public.change_orders c WHERE c.sales_order_id=o.id AND c.organization_id=o.organization_id AND c.status='approved' AND c.is_billable IS DISTINCT FROM false;
  desired:=coalesce(o.contract_total,0)-coalesce(p.tax_amount,0)-tax;
 END IF;
 SELECT assigned_to INTO rep FROM public.contacts WHERE id=o.contact_id AND organization_id=o.organization_id;
 PERFORM sales_credit_private.apply_total(o.organization_id,'order:'||o.id,o.id,'sales_order',o.contact_id,rep,'customer_owner_at_booking',desired,coalesce(o.booked_at,now()));
END $$;

ALTER TABLE public.recurring_subscriptions ADD COLUMN originating_sales_rep_id uuid,ADD COLUMN sales_origin_snapshotted_at timestamptz;
ALTER TABLE public.security_contracts ADD COLUMN originating_sales_rep_id uuid,ADD COLUMN sales_origin_snapshotted_at timestamptz;
CREATE FUNCTION sales_credit_private.snapshot_origin() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner_id uuid;
BEGIN
 IF TG_OP='UPDATE' THEN NEW.originating_sales_rep_id:=OLD.originating_sales_rep_id;NEW.sales_origin_snapshotted_at:=OLD.sales_origin_snapshotted_at;RETURN NEW;END IF;
 SELECT c.assigned_to INTO owner_id FROM public.contacts c JOIN public.profiles p ON p.id=c.assigned_to AND p.organization_id=c.organization_id AND p.is_sales_rep AND p.is_active
 WHERE c.id=NEW.contact_id AND c.organization_id=NEW.organization_id;
 NEW.originating_sales_rep_id:=owner_id;NEW.sales_origin_snapshotted_at:=now();RETURN NEW;
END $$;
CREATE TRIGGER sales_credit_subscription_origin BEFORE INSERT OR UPDATE ON public.recurring_subscriptions FOR EACH ROW EXECUTE FUNCTION sales_credit_private.snapshot_origin();
CREATE TRIGGER sales_credit_contract_origin BEFORE INSERT OR UPDATE ON public.security_contracts FOR EACH ROW EXECUTE FUNCTION sales_credit_private.snapshot_origin();

CREATE FUNCTION sales_credit_private.invoice_total(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
 ELSIF nullif(j->>'work_order_billing_request_id','') IS NOT NULL OR EXISTS(SELECT 1 FROM public.work_order_invoice_links l WHERE l.invoice_id=i.id AND l.organization_id=i.organization_id) THEN kind:='service_invoice';
 ELSIF lower(coalesce(i.invoice_type,'')) NOT IN ('retail','service','time_and_materials') AND lower(coalesce(i.source_type,'')) NOT IN ('retail','service','time_and_materials') THEN eligible:=false;END IF;
 IF eligible THEN allocation:=jsonb_build_array(jsonb_build_object('key','invoice:'||i.id,'rep',rep,'amount',v_net,'reason',reason));END IF;
 FOR s IN SELECT * FROM sales_credit_private.streams st WHERE st.organization_id=i.organization_id AND st.source_id=i.id AND st.source_type<>'sales_order' LOOP
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(allocation)x WHERE x->>'key'=s.stream_key) THEN PERFORM sales_credit_private.apply_total(s.organization_id,s.stream_key,i.id,s.source_type,s.customer_id,s.credited_rep_id,s.attribution_reason,0,now());END IF;
 END LOOP;
 FOR a IN SELECT * FROM jsonb_to_recordset(allocation)AS x(key text,rep uuid,amount numeric,reason text) LOOP
  PERFORM sales_credit_private.apply_total(i.organization_id,a.key,i.id,kind,i.contact_id,a.rep,a.reason,a.amount,now());
 END LOOP;
END $$;

CREATE FUNCTION sales_credit_private.guard_source_identity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF(NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.contact_id IS DISTINCT FROM OLD.contact_id)
 AND EXISTS(SELECT 1 FROM sales_credit_private.streams s WHERE s.source_id=OLD.id AND s.organization_id=OLD.organization_id)THEN
 RAISE EXCEPTION 'Posted performance source identity is immutable';END IF;RETURN NEW;
END $$;
CREATE TRIGGER sales_credit_order_identity BEFORE UPDATE ON public.sales_orders FOR EACH ROW EXECUTE FUNCTION sales_credit_private.guard_source_identity();
CREATE TRIGGER sales_credit_invoice_identity BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION sales_credit_private.guard_source_identity();

CREATE FUNCTION sales_credit_private.source_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r record;row_id uuid;old_id uuid;new_id uuid;s sales_credit_private.streams%ROWTYPE;
BEGIN
 IF TG_TABLE_NAME IN ('sales_orders','invoices') THEN
  IF TG_OP='DELETE' THEN
   FOR s IN SELECT * FROM sales_credit_private.streams WHERE organization_id=OLD.organization_id AND source_id=OLD.id LOOP
    PERFORM sales_credit_private.apply_total(s.organization_id,s.stream_key,s.source_id,s.source_type,s.customer_id,s.credited_rep_id,s.attribution_reason,0,now());
   END LOOP;
  ELSIF TG_TABLE_NAME='sales_orders' THEN PERFORM sales_credit_private.order_total(NEW.id);
  ELSE PERFORM sales_credit_private.invoice_total(NEW.id);END IF;
 ELSIF TG_TABLE_NAME='proposals' THEN
  IF TG_OP='DELETE' THEN row_id:=OLD.id;ELSE row_id:=NEW.id;END IF;
  FOR r IN SELECT id FROM public.sales_orders WHERE proposal_id=row_id ORDER BY id LOOP PERFORM sales_credit_private.order_total(r.id);END LOOP;
 ELSIF TG_TABLE_NAME='change_orders' THEN
  IF TG_OP<>'INSERT' THEN old_id:=OLD.sales_order_id;END IF;IF TG_OP<>'DELETE' THEN new_id:=NEW.sales_order_id;END IF;
  FOR r IN SELECT DISTINCT id FROM unnest(ARRAY[old_id,new_id])x(id)WHERE id IS NOT NULL ORDER BY id LOOP PERFORM sales_credit_private.order_total(r.id);END LOOP;
 ELSE
  IF TG_OP<>'INSERT' THEN old_id:=OLD.invoice_id;END IF;IF TG_OP<>'DELETE' THEN new_id:=NEW.invoice_id;END IF;
  FOR r IN SELECT DISTINCT id FROM unnest(ARRAY[old_id,new_id])x(id)WHERE id IS NOT NULL ORDER BY id LOOP PERFORM sales_credit_private.invoice_total(r.id);END LOOP;
 END IF;RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER sales_credit_order AFTER INSERT OR UPDATE OR DELETE ON public.sales_orders DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sales_credit_private.source_changed();
CREATE CONSTRAINT TRIGGER sales_credit_proposal AFTER INSERT OR UPDATE OR DELETE ON public.proposals DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sales_credit_private.source_changed();
CREATE CONSTRAINT TRIGGER sales_credit_change_order AFTER INSERT OR UPDATE OR DELETE ON public.change_orders DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sales_credit_private.source_changed();
CREATE CONSTRAINT TRIGGER sales_credit_invoice AFTER INSERT OR UPDATE OR DELETE ON public.invoices DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sales_credit_private.source_changed();
CREATE CONSTRAINT TRIGGER sales_credit_recurring_link AFTER INSERT OR UPDATE OR DELETE ON public.recurring_invoices DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sales_credit_private.source_changed();
CREATE CONSTRAINT TRIGGER sales_credit_work_order_link AFTER INSERT OR UPDATE OR DELETE ON public.work_order_invoice_links DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sales_credit_private.source_changed();

CREATE FUNCTION sales_credit_private.require_reader(p_target uuid,p_company boolean DEFAULT false)RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.profiles%ROWTYPE;manager boolean;
BEGIN
 SELECT * INTO a FROM public.profiles WHERE id=auth.uid()AND is_active;manager:=a.role IN ('admin','manager','sales_manager');
 IF a.id IS NULL OR a.organization_id IS NULL OR NOT coalesce(manager OR a.is_sales_rep,false) OR NOT public.user_has_module_access(a.id,'sales_dashboard')THEN RAISE EXCEPTION 'Sales dashboard access required' USING ERRCODE='42501';END IF;
 IF(p_company OR p_target IS DISTINCT FROM a.id)AND NOT manager THEN RAISE EXCEPTION 'Own sales history only' USING ERRCODE='42501';END IF;
 IF p_target IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=p_target AND p.organization_id=a.organization_id)THEN RAISE EXCEPTION 'Salesperson unavailable' USING ERRCODE='42501';END IF;
 RETURN a.organization_id;
END $$;
CREATE FUNCTION sales_credit_private.period_bounds(p_period text,p_tz text,p_now timestamptz DEFAULT now())RETURNS TABLE(start_at timestamptz,end_at timestamptz,previous_start timestamptz,previous_end timestamptz)LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE local_now timestamp:=p_now AT TIME ZONE p_tz;start_local timestamp;shift interval;
BEGIN
 IF p_period IS NULL OR p_period NOT IN ('month','quarter','year','yoy','all')THEN RAISE EXCEPTION 'Invalid performance period';END IF;
 start_local:=CASE WHEN p_period='all'THEN timestamp '1970-01-01'WHEN p_period IN ('year','yoy')THEN date_trunc('year',local_now)ELSE date_trunc(p_period,local_now)END;
 shift:=CASE WHEN p_period='month'THEN interval '1 month'WHEN p_period='quarter'THEN interval '3 months'ELSE interval '1 year'END;
 start_at:=start_local AT TIME ZONE p_tz;end_at:=p_now+interval '1 microsecond';previous_start:=(start_local-shift)AT TIME ZONE p_tz;
 previous_end:=least((local_now-shift)AT TIME ZONE p_tz,start_at)+interval '1 microsecond';RETURN NEXT;
END $$;
CREATE FUNCTION public.get_current_month_sales_competition()RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid;tz text;b record;entries jsonb;since timestamptz;
BEGIN
 org:=sales_credit_private.require_reader(auth.uid());SELECT coalesce(timezone,'America/Chicago')INTO tz FROM public.organizations WHERE id=org;
 SELECT * INTO b FROM sales_credit_private.period_bounds('month',tz);SELECT started_at INTO since FROM sales_credit_private.coverage;
 SELECT coalesce(jsonb_agg(jsonb_build_object('rank',r.rank,'repDisplayName',r.name,'monthlyTotal',r.total,'isCurrentUser',r.id=auth.uid())ORDER BY r.rank,r.name,r.id),'[]')INTO entries FROM(
  SELECT p.id,coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),p.full_name,'Sales rep')AS name,coalesce(sum(c.net_amount),0)AS total,rank()OVER(ORDER BY coalesce(sum(c.net_amount),0)DESC)AS rank
  FROM public.profiles p LEFT JOIN public.sales_performance_credits c ON c.credited_rep_id=p.id AND c.organization_id=org AND c.effective_at>=b.start_at AND c.effective_at<b.end_at
  WHERE p.organization_id=org AND p.is_sales_rep AND p.is_active GROUP BY p.id,p.first_name,p.last_name,p.full_name)r;
 RETURN jsonb_build_object('month',to_char(b.start_at AT TIME ZONE tz,'YYYY-MM'),'timezone',tz,'trackingSince',since,'leaderboard',entries);
END $$;
CREATE FUNCTION public.get_sales_performance(p_period text DEFAULT 'month',p_rep_id uuid DEFAULT auth.uid(),p_offset integer DEFAULT 0,p_limit integer DEFAULT 50)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid;tz text;b record;total numeric;previous numeric;n integer;rows jsonb;since timestamptz;unassigned numeric;
BEGIN
 org:=sales_credit_private.require_reader(p_rep_id,p_rep_id IS NULL);IF p_offset IS NULL OR p_limit IS NULL OR p_offset<0 OR p_limit<1 OR p_limit>100 THEN RAISE EXCEPTION 'Invalid performance page';END IF;
 SELECT coalesce(timezone,'America/Chicago')INTO tz FROM public.organizations WHERE id=org;SELECT * INTO b FROM sales_credit_private.period_bounds(p_period,tz);SELECT started_at INTO since FROM sales_credit_private.coverage;
 SELECT coalesce(sum(c.net_amount),0),count(*)INTO total,n FROM public.sales_performance_credits c WHERE c.organization_id=org AND(p_rep_id IS NULL OR c.credited_rep_id=p_rep_id)AND c.effective_at>=b.start_at AND c.effective_at<b.end_at;
 SELECT coalesce(sum(c.net_amount),0)INTO previous FROM public.sales_performance_credits c WHERE c.organization_id=org AND(p_rep_id IS NULL OR c.credited_rep_id=p_rep_id)AND c.effective_at>=b.previous_start AND c.effective_at<b.previous_end;
 IF p_rep_id IS NULL THEN SELECT coalesce(sum(c.net_amount),0)INTO unassigned FROM public.sales_performance_credits c WHERE c.organization_id=org AND c.credited_rep_id IS NULL AND c.effective_at>=b.start_at AND c.effective_at<b.end_at;END IF;
 SELECT coalesce(jsonb_agg(row_to_json(e)ORDER BY e.effective_at DESC,e.id DESC),'[]')INTO rows FROM(
  SELECT c.id,c.source_id,c.source_type,c.effective_at,c.net_amount,c.adjustment_of_id,c.attribution_reason,c.customer_id,coalesce(ct.full_name,ct.company_name,'Customer')AS customer_name,
   CASE WHEN c.stream_key LIKE 'order:%'THEN 'order'ELSE 'invoice'END AS record_kind
  FROM public.sales_performance_credits c LEFT JOIN public.contacts ct ON ct.id=c.customer_id AND ct.organization_id=c.organization_id
  WHERE c.organization_id=org AND(p_rep_id IS NULL OR c.credited_rep_id=p_rep_id)AND c.effective_at>=b.start_at AND c.effective_at<b.end_at ORDER BY c.effective_at DESC,c.id DESC LIMIT p_limit OFFSET p_offset)e;
 RETURN jsonb_build_object('period',p_period,'start',b.start_at,'through',b.end_at,'timezone',tz,'trackingSince',since,'total',total,'previousTotal',previous,'count',n,'unassignedTotal',unassigned,'events',rows);
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA sales_credit_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.get_current_month_sales_competition(),public.get_sales_performance(text,uuid,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_current_month_sales_competition(),public.get_sales_performance(text,uuid,integer,integer) TO authenticated;
NOTIFY pgrst,'reload schema';
