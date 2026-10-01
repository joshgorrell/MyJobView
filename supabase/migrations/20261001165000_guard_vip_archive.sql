-- Final VIP Maintenance completion protections.
-- Archive uses is_archived rather than status, so guard it separately.
CREATE OR REPLACE FUNCTION public.guard_vip_work_order_archive()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE missing text[];
BEGIN
 IF NEW.is_archived IS TRUE AND COALESCE(OLD.is_archived,false) IS FALSE
 AND EXISTS (SELECT 1 FROM work_order_options o WHERE o.id=NEW.work_order_type_id AND o.system_key='vip_program') THEN
   missing:=vip_maintenance_incomplete_sections(NEW.id);
   IF cardinality(missing)>0 THEN
     RAISE EXCEPTION 'VIP Maintenance cannot be archived until complete: %',array_to_string(missing,', ');
   END IF;
 END IF;
 RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_vip_work_order_archive ON public.work_orders;
CREATE TRIGGER guard_vip_work_order_archive
BEFORE UPDATE OF is_archived ON public.work_orders
FOR EACH ROW EXECUTE FUNCTION public.guard_vip_work_order_archive();

REVOKE ALL ON FUNCTION public.guard_vip_work_order_archive() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.guard_vip_work_order_archive() TO authenticated;


-- A VIP sales lead is created once, automatically, as part of completing the visit.
ALTER TABLE public.vip_maintenance_visits ADD COLUMN IF NOT EXISTS sales_lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL;

-- Give VIP its own measurable lead source instead of hiding it under "other".
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_lead_source_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_lead_source_check CHECK (lead_source IN ('manual','kiosk','website','referral','import','other','vip_maintenance'));

CREATE OR REPLACE FUNCTION public.create_vip_sales_lead(p_work_order_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.vip_maintenance_visits%ROWTYPE; w public.work_orders%ROWTYPE; c public.contacts%ROWTYPE; lead jsonb; lead_id uuid; rep uuid; descr text;
BEGIN
 SELECT * INTO v FROM public.vip_maintenance_visits WHERE work_order_id=p_work_order_id FOR UPDATE;
 IF NOT FOUND OR v.no_opportunities_identified THEN RETURN NULL; END IF;
 IF v.sales_lead_id IS NOT NULL THEN RETURN v.sales_lead_id; END IF;
 lead:=v.responses->'sales_lead';
 IF nullif(btrim(lead->>'request'),'') IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO w FROM public.work_orders WHERE id=p_work_order_id;
 SELECT * INTO c FROM public.contacts WHERE id=w.contact_id;
 rep:=w.customer_sales_rep_id;
 IF rep IS NULL THEN RAISE EXCEPTION 'Customer has no assigned sales rep. Assign one before completing this VIP visit.'; END IF;
 descr:=(lead->>'request') || coalesce(E'\nRoom/Area: '||nullif(btrim(lead->>'room'),''),'') ||
   E'\nInterest: '||coalesce(lead->>'interest','exploring') || E'\nTiming: '||coalesce(lead->>'timing','future') ||
   coalesce(E'\nNotes: '||nullif(btrim(lead->>'notes'),''),'') || E'\nSource: VIP Maintenance • '||coalesce(w.work_order_number,w.id::text);
 INSERT INTO public.leads(company_name,contact_name,email,phone,opportunity_description,status,assigned_to,created_by,is_fishbowl,claimed_at,lead_source)
 VALUES(c.company_name,coalesce(c.full_name,c.company_name,'Customer'),c.email,c.phone,descr,'claimed',rep,auth.uid(),false,now(),'vip_maintenance') RETURNING id INTO lead_id;
 UPDATE public.vip_maintenance_visits SET sales_lead_id=lead_id,updated_at=now() WHERE id=v.id;
 INSERT INTO public.notifications(user_id,type,lead_id,title,body,is_read)
 SELECT rep,'lead_assigned',lead_id,'New VIP Maintenance Lead',coalesce(c.full_name,c.company_name,'Customer')||' has a new lead from a completed VIP Maintenance visit',false
 WHERE coalesce((SELECT notify_on_lead_assigned FROM public.profiles WHERE id=rep),true);
 INSERT INTO public.feed_events(event_type,lead_id,user_id,metadata) VALUES('lead_created',lead_id,auth.uid(),jsonb_build_object('source','vip_maintenance','work_order_id',w.id,'vip_visit_id',v.id));
 RETURN lead_id;
END $$;
REVOKE ALL ON FUNCTION public.create_vip_sales_lead(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_vip_sales_lead(uuid) TO authenticated;
