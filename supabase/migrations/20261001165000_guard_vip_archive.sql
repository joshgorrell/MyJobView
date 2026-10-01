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
   IF NOT EXISTS (SELECT 1 FROM vip_maintenance_visits v WHERE v.work_order_id=NEW.id AND v.completed_at IS NOT NULL) THEN
     RAISE EXCEPTION 'VIP Maintenance must be completed before it can be archived.';
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
ALTER TABLE public.leads ADD CONSTRAINT leads_lead_source_check CHECK (lead_source IN ('manual','kiosk','website','referral','import','other','email_forward','vip_maintenance'));

CREATE OR REPLACE FUNCTION public.create_vip_sales_lead(p_work_order_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.vip_maintenance_visits%ROWTYPE; w public.work_orders%ROWTYPE; c public.contacts%ROWTYPE; lead jsonb; lead_id uuid; rep uuid; descr text;
BEGIN
 SELECT * INTO v FROM public.vip_maintenance_visits WHERE work_order_id=p_work_order_id FOR UPDATE;
 IF NOT FOUND OR v.no_opportunities_identified THEN RETURN NULL; END IF;
 IF v.sales_lead_id IS NOT NULL THEN RETURN v.sales_lead_id; END IF;
 lead:=v.responses->'sales_lead';
 IF nullif(btrim(lead->>'notes'),'') IS NULL THEN RETURN NULL; END IF;
 SELECT wo.* INTO w FROM public.work_orders wo
 JOIN public.contacts wc ON wc.id=wo.contact_id
 JOIN public.profiles actor ON actor.id=auth.uid() AND actor.is_active AND actor.contact_id IS NULL AND actor.organization_id=wc.organization_id
 WHERE wo.id=p_work_order_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'VIP Work Order not found in this organization' USING ERRCODE='42501'; END IF;
 SELECT * INTO c FROM public.contacts WHERE id=w.contact_id;
 rep:=w.customer_sales_rep_id;
 IF rep IS NULL THEN RAISE EXCEPTION 'Customer has no assigned sales rep. Assign one before completing this VIP visit.'; END IF;
 descr:=(lead->>'notes') || E'\n\nSource: VIP Maintenance • '||coalesce(w.work_order_number,w.id::text);
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


-- Replace the completion guard after create_vip_sales_lead exists so completion is the one submit action.
CREATE OR REPLACE FUNCTION public.guard_vip_work_order_completion() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE missing text[];
BEGIN
 IF NEW.status='completed' AND OLD.status IS DISTINCT FROM 'completed'
 AND EXISTS (SELECT 1 FROM work_order_options o WHERE o.id=NEW.work_order_type_id AND o.system_key='vip_program') THEN
   missing:=vip_maintenance_incomplete_sections(NEW.id);
   IF cardinality(missing)>0 THEN RAISE EXCEPTION 'VIP Maintenance incomplete: %',array_to_string(missing,', '); END IF;
   PERFORM create_vip_sales_lead(NEW.id);
   UPDATE vip_maintenance_visits SET completed_at=COALESCE(completed_at,now()),completed_by=COALESCE(completed_by,auth.uid()),updated_at=now() WHERE work_order_id=NEW.id;
 END IF;
 RETURN NEW;
END $$;


-- Completed VIP visits are permanent service records. Prevent later edits/deletes at the database layer,
-- while allowing the completion transaction itself to stamp completed_at/completed_by.
CREATE OR REPLACE FUNCTION public.lock_completed_vip_visit()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
  IF TG_OP='DELETE' AND OLD.completed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Completed VIP Maintenance visits are read-only.';
  END IF;
  IF TG_OP='UPDATE' AND OLD.completed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Completed VIP Maintenance visits are read-only.';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;

DROP TRIGGER IF EXISTS lock_completed_vip_visit ON public.vip_maintenance_visits;
CREATE TRIGGER lock_completed_vip_visit
BEFORE UPDATE OR DELETE ON public.vip_maintenance_visits
FOR EACH ROW EXECUTE FUNCTION public.lock_completed_vip_visit();

CREATE OR REPLACE FUNCTION public.lock_completed_vip_finding()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE v_completed_at timestamptz;
BEGIN
  SELECT completed_at INTO v_completed_at
  FROM public.vip_maintenance_visits
  WHERE id=COALESCE(NEW.visit_id,OLD.visit_id);
  IF v_completed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Findings on a completed VIP Maintenance visit are read-only.';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;

DROP TRIGGER IF EXISTS lock_completed_vip_finding ON public.vip_maintenance_findings;
CREATE TRIGGER lock_completed_vip_finding
BEFORE UPDATE OR DELETE ON public.vip_maintenance_findings
FOR EACH ROW EXECUTE FUNCTION public.lock_completed_vip_finding();

REVOKE ALL ON FUNCTION public.lock_completed_vip_visit(),public.lock_completed_vip_finding() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.lock_completed_vip_visit(),public.lock_completed_vip_finding() TO authenticated;
