/*
# Display business customers by company name in Flow

1. Purpose
- Show business customers by their company name in Flow instead of displaying the associated person as though they were the customer.
- Preserve personal names for individual contacts.

2. Existing data
- Update existing `flow_events.customer_name` snapshots for business contacts when a non-empty company name is available.
- No customer records, contacts, or event history are deleted.

3. Future events
- Update the trusted Flow event capture function so business contacts use `company_name` first.
- Individual contacts continue to use `full_name`, then `contact_name`, then `company_name`.

4. Security
- Preserve the existing SECURITY DEFINER function, empty search path, trigger-only execution model, and existing Flow permissions.
- No RLS policies or grants are changed.
*/

CREATE OR REPLACE FUNCTION flow_private.capture_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 n jsonb=to_jsonb(NEW); o jsonb; v_org uuid; v_contact uuid; v_project uuid; v_wo uuid;
 v_office uuid; v_location uuid; v_module text; v_category text; v_title text; v_summary text;
 v_details text=''; v_internal boolean=false; v_actor uuid; v_actor_name text;
 w jsonb; p jsonb; c jsonb; linked jsonb; changes text[]='{}'; k text; fields text[];
BEGIN
 IF TG_OP='UPDATE' THEN o=to_jsonb(OLD); ELSE o='{}'::jsonb; END IF;
 -- First opens have a dedicated targeted event, not a second generic view-status update.
 IF TG_TABLE_NAME='proposals' AND TG_OP='UPDATE' THEN
  IF n->>'status' IN ('portal','viewed') AND o->>'status' IS DISTINCT FROM n->>'status'
    AND n->'sent_at' IS NOT DISTINCT FROM o->'sent_at'
    AND n->'approved_at' IS NOT DISTINCT FROM o->'approved_at'
    AND n->'declined_at' IS NOT DISTINCT FROM o->'declined_at' THEN RETURN NEW; END IF;
 END IF;
 v_org=nullif(n->>'organization_id','')::uuid;
 v_contact=nullif(coalesce(n->>'contact_id',n->>'customer_contact_id'),'')::uuid;
 v_project=nullif(n->>'project_id','')::uuid; v_wo=nullif(n->>'work_order_id','')::uuid;
 v_office=nullif(n->>'office_id','')::uuid; v_location=nullif(n->>'customer_location_id','')::uuid;
 CASE TG_TABLE_NAME
 WHEN 'work_orders' THEN v_wo=NEW.id; v_module='work_orders'; v_category='work'; v_title='Work order';
  fields=ARRAY['status','assigned_to','scheduled_date','scheduled_start_time','scheduled_end_time','start_date','description','current_location_status','customer_contacted'];
 WHEN 'projects' THEN v_project=NEW.id; v_module='projects'; v_category='work'; v_title='Project';
  fields=ARRAY['status','assigned_pm','salesperson_id','designer_id','substantial_completion_date','test_tune_started_at'];
 WHEN 'service_requests' THEN v_module='service_requests'; v_category='service'; v_title='Service request';
  fields=ARRAY['status','work_order_id','requested_date','requested_time','customer_contact_confirmed_at'];
 WHEN 'change_orders' THEN v_module='change_orders'; v_category='sales'; v_title='Change order '||coalesce(n->>'change_order_number','');
  fields=ARRAY['status','customer_approved','description'];
 WHEN 'product_requests' THEN v_module='parts_requests'; v_category='materials'; v_title='Parts request';
  fields=ARRAY['status','assigned_to'];
 WHEN 'proposals' THEN v_module='proposals'; v_category='sales'; v_title='Proposal '||coalesce(n->>'proposal_number','');
  fields=ARRAY['status','sent_at','approved_at','declined_at'];
 WHEN 'invoices' THEN v_module='invoices'; v_category='financial'; v_title='Invoice '||coalesce(n->>'invoice_number','');
  fields=ARRAY['status'];
 WHEN 'payments' THEN
  SELECT to_jsonb(i) INTO linked FROM public.invoices i WHERE i.id=(n->>'invoice_id')::uuid AND i.organization_id=v_org;
  IF linked IS NULL THEN RETURN NEW; END IF;
  v_contact=(linked->>'contact_id')::uuid; v_project=(linked->>'project_id')::uuid; v_office=(linked->>'office_id')::uuid;
  v_module='invoices'; v_category='financial'; v_title='Payment recorded for invoice '||coalesce(linked->>'invoice_number','');
  IF TG_OP<>'INSERT' THEN RETURN NEW; END IF; v_summary=v_title;
 WHEN 'contacts' THEN v_contact=NEW.id; v_module='contacts'; v_category='customer'; v_title='Customer';
  fields=ARRAY['assigned_to','phone','email','street_address','city','state','zip_code'];
 WHEN 'project_notes' THEN v_module='projects'; v_category='update'; v_title='Project note';
  v_summary='Project note added'; v_details='Open the project to read the current note.'; v_internal=coalesce((n->>'is_internal')::boolean,false);
 WHEN 'customer_contact_log' THEN
  IF v_wo IS NULL AND n->>'service_request_id' IS NOT NULL THEN
   SELECT to_jsonb(s) INTO linked FROM public.service_requests s WHERE s.id=(n->>'service_request_id')::uuid AND s.organization_id=v_org;
   v_contact=(linked->>'contact_id')::uuid; v_project=(linked->>'project_id')::uuid;
  END IF;
  v_module=CASE WHEN v_wo IS NOT NULL THEN 'work_orders' ELSE 'service_requests' END;
  v_category='customer'; v_title='Customer contacted'; v_summary=v_title;
 WHEN 'flow_updates' THEN
  v_module=CASE WHEN v_wo IS NOT NULL THEN 'work_orders' WHEN v_project IS NOT NULL THEN 'projects' ELSE 'contacts' END;
  v_category='update'; v_title=initcap(replace(n->>'update_type','_',' ')); v_summary=v_title||': '||left(n->>'body',110); v_details=n->>'body';
 ELSE RETURN NEW;
 END CASE;
 IF v_org IS NULL THEN RETURN NEW; END IF;
 IF v_summary IS NULL THEN
  IF TG_OP='INSERT' THEN v_summary=v_title||' created';
  ELSE
   FOREACH k IN ARRAY fields LOOP
    IF (n->k) IS DISTINCT FROM (o->k) THEN
     IF k='status' THEN changes=array_append(changes,replace(coalesce(n->>k,'cleared'),'_',' '));
     ELSIF k IN ('assigned_to','assigned_pm','salesperson_id','designer_id') THEN changes=array_append(changes,'assignment changed');
     ELSIF k IN ('scheduled_date','scheduled_start_time','scheduled_end_time','start_date','requested_date','requested_time') THEN changes=array_append(changes,'schedule changed'); v_category='scheduling';
     ELSIF k='description' THEN changes=array_append(changes,'scope updated');
     ELSIF k='current_location_status' THEN changes=array_append(changes,replace(coalesce(n->>k,'status cleared'),'_',' '));
     ELSIF k='customer_approved' AND n->>k='true' THEN changes=array_append(changes,'customer approved');
     ELSE changes=array_append(changes,replace(k,'_',' ')||' updated'); END IF;
     IF k IN ('status','scheduled_date','scheduled_start_time','scheduled_end_time','start_date','requested_date','requested_time','current_location_status') THEN
      v_details=v_details||initcap(replace(k,'_',' '))||': '||coalesce(o->>k,'Not set')||' → '||coalesce(n->>k,'Not set')||E'\n';
     END IF;
    END IF;
   END LOOP;
   IF cardinality(changes)=0 THEN RETURN NEW; END IF;
   SELECT array_agg(DISTINCT x) INTO changes FROM unnest(changes) x;
   v_summary=v_title||' · '||array_to_string(changes,' · ');
  END IF;
 END IF;
 IF v_wo IS NOT NULL THEN
  SELECT to_jsonb(x) INTO w FROM public.work_orders x WHERE x.id=v_wo AND x.organization_id=v_org;
  IF w IS NULL THEN RETURN NEW; END IF;
  v_project=coalesce(v_project,(w->>'project_id')::uuid); v_contact=coalesce(v_contact,(w->>'contact_id')::uuid);
  v_office=coalesce(v_office,(w->>'office_id')::uuid); v_location=coalesce(v_location,(w->>'customer_location_id')::uuid);
 END IF;
 IF v_project IS NOT NULL THEN
  SELECT to_jsonb(x) INTO p FROM public.projects x WHERE x.id=v_project AND x.organization_id=v_org;
  IF p IS NULL THEN RETURN NEW; END IF;
  v_contact=coalesce(v_contact,(p->>'contact_id')::uuid); v_office=coalesce(v_office,(p->>'office_id')::uuid); v_location=coalesce(v_location,(p->>'customer_location_id')::uuid);
 END IF;
 IF v_contact IS NOT NULL THEN
  SELECT to_jsonb(x) INTO c FROM public.contacts x WHERE x.id=v_contact AND x.organization_id=v_org;
  IF c IS NULL THEN RETURN NEW; END IF;
  v_office=coalesce(v_office,(c->>'office_id')::uuid);
 END IF;
 IF num_nonnulls(v_contact,v_project,v_wo)=0 THEN RETURN NEW; END IF;
 SELECT id,full_name INTO v_actor,v_actor_name FROM public.profiles WHERE id=auth.uid() AND organization_id=v_org;
 IF v_actor IS NULL THEN v_actor_name=CASE WHEN auth.uid() IS NULL THEN 'System' ELSE 'Customer / integration' END; END IF;
 INSERT INTO public.flow_events(organization_id,contact_id,project_id,work_order_id,customer_location_id,office_id,actor_id,actor_name,customer_name,project_name,work_order_number,location_name,category,event_type,summary,details,source_table,source_id,required_module,is_internal)
 VALUES(v_org,v_contact,v_project,v_wo,v_location,v_office,v_actor,coalesce(v_actor_name,'Team member'),
 coalesce(
   CASE WHEN c->>'contact_type'='business' THEN nullif(c->>'company_name','') END,
   nullif(c->>'full_name',''),nullif(c->>'contact_name',''),nullif(c->>'company_name',''),'Customer'),
 coalesce(p->>'name',''),coalesce(w->>'work_order_number',''),
 coalesce((SELECT l.name FROM public.customer_locations l WHERE l.id=v_location AND l.customer_contact_id=v_contact),''),
 v_category,TG_TABLE_NAME||'.'||lower(TG_OP),v_summary,coalesce(v_details,''),TG_TABLE_NAME,NEW.id,v_module,v_internal);
 RETURN NEW;
END;
$$;

UPDATE public.flow_events e
SET customer_name=c.company_name
FROM public.contacts c
WHERE e.contact_id=c.id
  AND c.contact_type='business'
  AND nullif(trim(c.company_name),'') IS NOT NULL
  AND e.customer_name IS DISTINCT FROM c.company_name;
