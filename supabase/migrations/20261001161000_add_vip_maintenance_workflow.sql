-- VIP Maintenance Work Order workflow
-- Minimal persistence + server-side completion guard. Existing WO systems remain authoritative.

CREATE TABLE IF NOT EXISTS public.vip_maintenance_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  work_order_id uuid NOT NULL UNIQUE REFERENCES public.work_orders(id) ON DELETE CASCADE,
  responses jsonb NOT NULL DEFAULT '{}'::jsonb,
  no_issues_found boolean NOT NULL DEFAULT false,
  no_opportunities_identified boolean NOT NULL DEFAULT false,
  training_not_needed boolean NOT NULL DEFAULT false,
  customer_not_present boolean NOT NULL DEFAULT false,
  customer_acknowledged_at timestamptz,
  completed_at timestamptz,
  completed_by uuid REFERENCES public.profiles(id),
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vip_maintenance_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  visit_id uuid NOT NULL REFERENCES public.vip_maintenance_visits(id) ON DELETE CASCADE,
  room text,
  description text NOT NULL,
  notes text,
  dispositions text[] NOT NULL DEFAULT '{}'::text[],
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (array_length(dispositions,1) IS NULL OR dispositions <@ ARRAY['resolved_today','punchlist','service_follow_up','sales','no_action']::text[])
);

CREATE INDEX IF NOT EXISTS idx_vip_maintenance_visits_org ON public.vip_maintenance_visits(organization_id);
CREATE INDEX IF NOT EXISTS idx_vip_maintenance_findings_visit ON public.vip_maintenance_findings(visit_id);

ALTER TABLE public.vip_maintenance_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vip_maintenance_findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY vip_visits_staff ON public.vip_maintenance_visits FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.organization_id=vip_maintenance_visits.organization_id AND p.is_active AND p.contact_id IS NULL))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.organization_id=vip_maintenance_visits.organization_id AND p.is_active AND p.contact_id IS NULL));

CREATE POLICY vip_findings_staff ON public.vip_maintenance_findings FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.organization_id=vip_maintenance_findings.organization_id AND p.is_active AND p.contact_id IS NULL))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.organization_id=vip_maintenance_findings.organization_id AND p.is_active AND p.contact_id IS NULL));

CREATE OR REPLACE FUNCTION public.vip_maintenance_incomplete_sections(p_work_order_id uuid)
RETURNS text[] LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE v vip_maintenance_visits; f record; missing text[] := '{}'; section text;
BEGIN
 SELECT vmv.* INTO v FROM vip_maintenance_visits vmv WHERE vmv.work_order_id=p_work_order_id;
 IF NOT FOUND THEN RETURN ARRAY['VIP Maintenance']; END IF;

 FOREACH section IN ARRAY ARRAY['customer_check_in','network_internet','av_automation','security_surveillance','room_by_room','preventive_maintenance'] LOOP
   IF NOT (COALESCE((v.responses->section->>'complete')::boolean,false) OR (section <> 'customer_check_in' AND COALESCE((v.responses->section->>'na')::boolean,false)))
   THEN missing:=array_append(missing,section); END IF;
 END LOOP;

 IF NOT (COALESCE((v.responses->'customer_training'->>'complete')::boolean,false) OR v.training_not_needed OR v.customer_not_present)
 THEN missing:=array_append(missing,'customer_training'); END IF;
 IF NOT (v.no_issues_found OR EXISTS(SELECT 1 FROM vip_maintenance_findings x WHERE x.visit_id=v.id))
 THEN missing:=array_append(missing,'findings'); END IF;
 IF EXISTS(SELECT 1 FROM vip_maintenance_findings x WHERE x.visit_id=v.id AND cardinality(x.dispositions)=0)
 THEN missing:=array_append(missing,'finding_dispositions'); END IF;
 IF NOT (v.no_opportunities_identified OR COALESCE(jsonb_array_length(COALESCE(v.responses->'opportunities','[]'::jsonb)),0)>0)
 THEN missing:=array_append(missing,'opportunities'); END IF;
 IF NOT (v.customer_not_present OR v.customer_acknowledged_at IS NOT NULL)
 THEN missing:=array_append(missing,'customer_acknowledgment'); END IF;
 RETURN missing;
END $$;

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
CREATE TRIGGER guard_vip_work_order_completion BEFORE UPDATE OF status ON public.work_orders FOR EACH ROW EXECUTE FUNCTION public.guard_vip_work_order_completion();

REVOKE ALL ON FUNCTION public.vip_maintenance_incomplete_sections(uuid),public.guard_vip_work_order_completion() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.vip_maintenance_incomplete_sections(uuid) TO authenticated;
