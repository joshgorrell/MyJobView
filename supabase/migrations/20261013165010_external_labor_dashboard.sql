-- External reporting observations never create native punches or payable payroll segments.
ALTER TABLE public.time_entry_import_profiles ADD COLUMN IF NOT EXISTS import_type text NOT NULL DEFAULT 'legacy';
ALTER TABLE public.time_entry_import_history ADD COLUMN IF NOT EXISTS import_type text NOT NULL DEFAULT 'legacy';
CREATE TABLE public.labor_import_sources (
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 source text NOT NULL CHECK(source IN ('ipoint','quickbooks_time')),
 enabled boolean NOT NULL DEFAULT false, native_from date,
 last_success_at timestamptz, last_error text, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,source)
);
CREATE TABLE public.labor_dashboard_roster (
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 profile_id uuid NOT NULL REFERENCES public.profiles(id), active boolean NOT NULL DEFAULT true,
 PRIMARY KEY(organization_id,profile_id)
);
CREATE TABLE public.labor_external_employee_mappings (
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 source text NOT NULL CHECK(source IN ('ipoint','quickbooks_time')),
 external_employee_id text NOT NULL, profile_id uuid NOT NULL REFERENCES public.profiles(id),
 PRIMARY KEY(organization_id,source,external_employee_id),
 UNIQUE(organization_id,source,profile_id)
);
CREATE TABLE public.external_labor_snapshots (
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 source text NOT NULL CHECK(source IN ('ipoint','quickbooks_time')),
 kind text NOT NULL CHECK(kind IN ('technician','payroll','project')), day date NOT NULL,
 payload jsonb NOT NULL, content_hash text NOT NULL, imported_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,source,kind,day),
 CHECK ((source='ipoint' AND kind IN ('technician','project')) OR (source='quickbooks_time' AND kind='payroll'))
);
CREATE TABLE public.labor_import_batches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations(id),
 source text NOT NULL, kind text NOT NULL, day date NOT NULL, content_hash text NOT NULL,
 payload jsonb NOT NULL, imported_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,source,kind,day,content_hash)
);
CREATE TABLE public.labor_dashboard_calendars (
 organization_id uuid PRIMARY KEY REFERENCES public.organizations(id), holidays date[] NOT NULL DEFAULT '{}'
);
CREATE TABLE public.labor_sync_credentials (
 organization_id uuid PRIMARY KEY REFERENCES public.organizations(id),
 token_hash text UNIQUE NOT NULL CHECK(token_hash ~ '^[a-f0-9]{64}$'), enabled boolean NOT NULL DEFAULT true
);
CREATE OR REPLACE FUNCTION public.can_manage_labor(p_org uuid) RETURNS boolean
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND organization_id=p_org AND role='admin' AND is_active=true)
$$;
REVOKE ALL ON FUNCTION public.can_manage_labor(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_labor(uuid) TO authenticated;
DO $$DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['labor_import_sources','labor_dashboard_roster','labor_external_employee_mappings','external_labor_snapshots','labor_import_batches','labor_dashboard_calendars'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY labor_admin_read ON public.%I FOR SELECT TO authenticated USING(public.can_manage_labor(organization_id))',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['labor_import_sources','labor_dashboard_calendars'] LOOP
  EXECUTE format('CREATE POLICY labor_admin_update ON public.%I FOR UPDATE TO authenticated USING(public.can_manage_labor(organization_id)) WITH CHECK(public.can_manage_labor(organization_id))',t);
  EXECUTE format('GRANT UPDATE ON public.%I TO authenticated',t);
 END LOOP;
END $$;
ALTER TABLE public.labor_sync_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.labor_sync_credentials FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.labor_sync_credentials TO service_role;
CREATE OR REPLACE FUNCTION public.ingest_external_labor(p_organization_id uuid,p_source text,p_snapshots jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s jsonb; k text; d date; h text; old_hash text; enabled_source boolean; changed integer:=0; skipped integer:=0; cutoff date;
BEGIN
 IF p_source NOT IN ('ipoint','quickbooks_time') OR jsonb_typeof(p_snapshots)<>'array' OR jsonb_array_length(p_snapshots)>1000 THEN RAISE EXCEPTION 'Invalid labor import'; END IF;
 SELECT enabled,native_from INTO enabled_source,cutoff FROM public.labor_import_sources WHERE organization_id=p_organization_id AND source=p_source FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Labor source is not configured'; END IF;
 IF NOT enabled_source THEN RETURN jsonb_build_object('changed',0,'disabled',true); END IF;
 FOR s IN SELECT value FROM jsonb_array_elements(p_snapshots) LOOP
  k:=s->>'kind'; d:=(s->>'day')::date;
  IF d IS NULL OR d>current_date OR NOT((p_source='ipoint' AND k IN ('technician','project')) OR(p_source='quickbooks_time' AND k='payroll')) OR jsonb_typeof(s->'records') IS DISTINCT FROM 'array' OR jsonb_array_length(s->'records')=0 THEN RAISE EXCEPTION 'Invalid or empty labor snapshot'; END IF;
  -- Cutover is explicit; historical records remain intact. Project snapshots are not cumulative sums.
  IF cutoff IS NOT NULL AND d>=cutoff THEN skipped:=skipped+1; CONTINUE; END IF;
  h:=md5((s-'updatedAt')::text);
  SELECT content_hash INTO old_hash FROM public.external_labor_snapshots WHERE organization_id=p_organization_id AND source=p_source AND kind=k AND day=d;
  IF old_hash=h THEN skipped:=skipped+1; CONTINUE; END IF;
  INSERT INTO public.labor_import_batches(organization_id,source,kind,day,content_hash,payload) VALUES(p_organization_id,p_source,k,d,h,s) ON CONFLICT DO NOTHING;
  INSERT INTO public.external_labor_snapshots(organization_id,source,kind,day,content_hash,payload) VALUES(p_organization_id,p_source,k,d,h,s)
  ON CONFLICT(organization_id,source,kind,day) DO UPDATE SET payload=excluded.payload,content_hash=excluded.content_hash,imported_at=now();
  changed:=changed+1;
 END LOOP;
 UPDATE public.labor_import_sources SET last_success_at=now(),last_error=NULL,updated_at=now() WHERE organization_id=p_organization_id AND source=p_source;
 RETURN jsonb_build_object('changed',changed,'unchanged_or_cutover',skipped,'disabled',false);
END $$;
REVOKE ALL ON FUNCTION public.ingest_external_labor(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_external_labor(uuid,text,jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.get_labor_dashboard(p_start date,p_end date) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE org uuid; result jsonb;
BEGIN
 SELECT organization_id INTO org FROM profiles WHERE id=auth.uid();
 IF NOT public.can_manage_labor(org) THEN RAISE EXCEPTION 'Labor dashboard requires organization admin access'; END IF;
 IF p_start IS NULL OR p_end IS NULL OR p_start>p_end OR p_end-p_start>1830 THEN RAISE EXCEPTION 'Invalid date range'; END IF;
 SELECT jsonb_build_object(
  'sources',COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM labor_import_sources s WHERE s.organization_id=org),'[]'::jsonb),
  'timezone',(SELECT timezone FROM organizations WHERE id=org),
  'roster',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name,'hire_date',e.hire_date)) FROM labor_dashboard_roster r JOIN profiles p ON p.id=r.profile_id AND p.organization_id=r.organization_id LEFT JOIN employees e ON e.user_id=p.id AND e.organization_id=r.organization_id WHERE r.organization_id=org AND r.active),'[]'::jsonb),
  'configs',COALESCE((SELECT jsonb_agg(to_jsonb(c)||jsonb_build_object('profile_id',e.user_id)) FROM employee_payroll_configs c JOIN employees e ON e.id=c.employee_id AND e.organization_id=c.organization_id WHERE c.organization_id=org AND c.effective_from<=p_end AND(c.effective_to IS NULL OR c.effective_to>=p_start)),'[]'::jsonb),
  'mappings',COALESCE((SELECT jsonb_agg(to_jsonb(m)) FROM labor_external_employee_mappings m WHERE m.organization_id=org),'[]'::jsonb),
  'holidays',COALESCE((SELECT to_jsonb(holidays) FROM labor_dashboard_calendars WHERE organization_id=org),'[]'::jsonb),
  'snapshots',COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM external_labor_snapshots s WHERE s.organization_id=org AND s.kind<>'project' AND s.day BETWEEN p_start AND p_end),'[]'::jsonb),
  'project_snapshot',(SELECT to_jsonb(s) FROM external_labor_snapshots s WHERE s.organization_id=org AND s.kind='project' AND s.day<=p_end ORDER BY s.day DESC LIMIT 1),
  'latest_job_day',(SELECT max(day) FROM external_labor_snapshots WHERE organization_id=org AND kind='technician'),
  'latest_payroll_day',(SELECT max(day) FROM external_labor_snapshots WHERE organization_id=org AND kind='payroll'),
  'native_jobs',COALESCE((SELECT jsonb_agg(to_jsonb(j)) FROM(SELECT technician_id AS profile_id,entry_date AS day,sum(total_hours) AS hours FROM time_entries WHERE organization_id=org AND entry_date BETWEEN p_start AND p_end AND status='approved' AND COALESCE(entry_type,'work_order') IN ('work_order','project') GROUP BY technician_id,entry_date) j),'[]'::jsonb),
  'native_payroll',COALESCE((SELECT jsonb_agg(to_jsonb(j)) FROM(SELECT technician_id AS profile_id,entry_date AS day,sum(CASE WHEN leave_type IS NULL THEN total_hours ELSE 0 END) AS hours,sum(CASE WHEN leave_type IS NOT NULL THEN total_hours ELSE 0 END) AS leave_hours,bool_or(status NOT IN ('clocked_out','approved') OR total_hours IS NULL OR total_hours<0) AS needs_review FROM daily_clock_entries WHERE organization_id=org AND entry_date BETWEEN p_start AND p_end GROUP BY technician_id,entry_date) j),'[]'::jsonb),
  'native_projects',COALESCE((SELECT jsonb_agg(jsonb_build_object('project_id',p.id,'project_name',p.name,'hours_sold',so.total_estimated_labor_hours,'hours_used',(SELECT sum(te.total_hours) FROM time_entries te LEFT JOIN work_orders wo ON wo.id=te.work_order_id AND wo.organization_id=te.organization_id WHERE te.organization_id=org AND COALESCE(te.project_id,wo.project_id)=p.id AND te.status='approved' AND te.entry_date<=p_end),'status',p.status)) FROM projects p LEFT JOIN sales_orders so ON so.id=p.sales_order_id AND so.organization_id=p.organization_id WHERE p.organization_id=org),'[]'::jsonb)
 ) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.get_labor_dashboard(date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_labor_dashboard(date,date) TO authenticated;

