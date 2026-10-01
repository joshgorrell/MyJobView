-- Route VIP findings into existing MJV systems without duplicate entry.
ALTER TABLE public.vip_maintenance_findings
  ADD COLUMN IF NOT EXISTS punchlist_task_id uuid REFERENCES public.punchlist_tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS routed_at timestamptz;

CREATE OR REPLACE FUNCTION public.route_vip_maintenance_finding(p_finding_id uuid)
RETURNS public.vip_maintenance_findings
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 f public.vip_maintenance_findings%ROWTYPE; v public.vip_maintenance_visits%ROWTYPE; w public.work_orders%ROWTYPE;
 p public.profiles%ROWTYPE;
BEGIN
 SELECT * INTO p FROM public.profiles WHERE id=auth.uid() AND is_active AND contact_id IS NULL;
 SELECT * INTO f FROM public.vip_maintenance_findings WHERE id=p_finding_id FOR UPDATE;
 IF NOT FOUND OR p.organization_id IS DISTINCT FROM f.organization_id THEN RAISE EXCEPTION 'Finding not found' USING ERRCODE='42501'; END IF;
 IF cardinality(f.dispositions)<>1 THEN RAISE EXCEPTION 'Choose exactly one finding outcome'; END IF;
 IF 'no_action'=ANY(f.dispositions) AND coalesce(nullif(btrim(f.notes),''),'')='' THEN RAISE EXCEPTION 'A reason is required when No Action is selected.'; END IF;
 SELECT * INTO v FROM public.vip_maintenance_visits WHERE id=f.visit_id;
 SELECT wo.* INTO w FROM public.work_orders wo
 JOIN public.contacts wc ON wc.id=wo.contact_id AND wc.organization_id=f.organization_id
 WHERE wo.id=v.work_order_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'VIP Work Order not found in this organization' USING ERRCODE='42501'; END IF;
 IF 'punchlist'=ANY(f.dispositions) AND f.punchlist_task_id IS NULL THEN
   INSERT INTO public.punchlist_tasks(organization_id,contact_id,title,details,status,priority_order)
   VALUES(f.organization_id,w.contact_id,left(f.description,120),f.description,'draft',
     coalesce((SELECT max(priority_order)+1 FROM public.punchlist_tasks WHERE contact_id=w.contact_id),0))
   RETURNING id INTO f.punchlist_task_id;
 END IF;


 UPDATE public.vip_maintenance_findings SET punchlist_task_id=f.punchlist_task_id,routed_at=now(),updated_at=now() WHERE id=f.id RETURNING * INTO f;
 RETURN f;
END $$;
REVOKE ALL ON FUNCTION public.route_vip_maintenance_finding(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.route_vip_maintenance_finding(uuid) TO authenticated;

-- Completion requires downstream routing for dispositions that create MJV objects.
CREATE OR REPLACE FUNCTION public.vip_maintenance_incomplete_sections(p_work_order_id uuid)
RETURNS text[] LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE v vip_maintenance_visits; missing text[] := '{}'; section text;
BEGIN
 SELECT vmv.* INTO v FROM vip_maintenance_visits vmv WHERE vmv.work_order_id=p_work_order_id;
 IF NOT FOUND THEN RETURN ARRAY['VIP Maintenance']; END IF;
 FOREACH section IN ARRAY ARRAY['customer_check_in','network_internet','av_automation','security_surveillance','room_by_room','preventive_maintenance'] LOOP
   IF NOT (COALESCE((v.responses->section->>'complete')::boolean,false) OR (section <> 'customer_check_in' AND COALESCE((v.responses->section->>'na')::boolean,false))) THEN missing:=array_append(missing,section); END IF;
 END LOOP;
 IF NOT (COALESCE((v.responses->'customer_training'->>'complete')::boolean,false) OR v.training_not_needed OR v.customer_not_present) THEN missing:=array_append(missing,'customer_training'); END IF;
 IF NOT (v.no_issues_found OR EXISTS(SELECT 1 FROM vip_maintenance_findings x WHERE x.visit_id=v.id)) THEN missing:=array_append(missing,'findings'); END IF;
 IF EXISTS(SELECT 1 FROM vip_maintenance_findings x WHERE x.visit_id=v.id AND cardinality(x.dispositions)<>1) THEN missing:=array_append(missing,'finding_dispositions'); END IF;
 IF EXISTS(SELECT 1 FROM vip_maintenance_findings x WHERE x.visit_id=v.id AND 'no_action'=ANY(x.dispositions) AND coalesce(nullif(btrim(x.notes),''),'')='') THEN missing:=array_append(missing,'no_action_reason'); END IF;
 IF EXISTS(SELECT 1 FROM vip_maintenance_findings x WHERE x.visit_id=v.id AND
   ('punchlist'=ANY(x.dispositions) AND x.punchlist_task_id IS NULL))
 THEN missing:=array_append(missing,'unrouted_findings'); END IF;
 IF NOT (v.no_opportunities_identified OR nullif(btrim(v.responses->'sales_lead'->>'notes'),'') IS NOT NULL) THEN missing:=array_append(missing,'sales_lead'); END IF;
 IF NOT (v.customer_not_present OR v.customer_acknowledged_at IS NOT NULL) THEN missing:=array_append(missing,'customer_acknowledgment'); END IF;
 RETURN missing;
END $$;
