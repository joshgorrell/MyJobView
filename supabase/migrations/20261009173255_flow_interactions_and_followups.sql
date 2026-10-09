-- Keep the existing interaction/schedule records; Flow is now their only page.
CREATE SCHEMA IF NOT EXISTS flow_private;
ALTER TABLE public.connections DROP CONSTRAINT IF EXISTS connections_connection_type_check;
ALTER TABLE public.connections ADD CONSTRAINT connections_connection_type_check CHECK(connection_type IN ('meeting','call','email','casual_conversation','other','site_visit','demo','proposal_sent','follow_up','check_in'));
ALTER TABLE public.scheduled_connections DROP CONSTRAINT IF EXISTS scheduled_connections_connection_type_check;
ALTER TABLE public.scheduled_connections ADD CONSTRAINT scheduled_connections_connection_type_check CHECK(connection_type IN ('call','email','meeting','site_visit','check_in','other','casual_conversation','demo','proposal_sent','follow_up'));

CREATE OR REPLACE FUNCTION public.flow_has_module_access(p_module text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT private.can_access_page(auth.uid(),p_module);
$$;
REVOKE ALL ON FUNCTION public.flow_has_module_access(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.flow_has_module_access(text) TO authenticated;

CREATE OR REPLACE FUNCTION flow_private.require_followup_actor()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE org uuid;
BEGIN
 SELECT organization_id INTO org FROM public.profiles WHERE id=auth.uid() AND is_active AND role<>'portal_user';
 IF org IS NULL OR NOT public.flow_has_module_access('feed') THEN RAISE EXCEPTION 'Flow access required' USING ERRCODE='42501'; END IF;
 RETURN org;
END $$;
REVOKE ALL ON FUNCTION flow_private.require_followup_actor() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION flow_private.interaction_context(p_scope jsonb,p_org uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE c uuid:=nullif(p_scope->>'contact_id','')::uuid; p uuid:=nullif(p_scope->>'project_id','')::uuid; w uuid:=nullif(p_scope->>'work_order_id','')::uuid; linked record;
BEGIN
 IF w IS NOT NULL THEN
  SELECT contact_id,project_id INTO linked FROM public.work_orders WHERE id=w AND organization_id=p_org;
  IF NOT FOUND OR NOT public.flow_has_module_access('work_orders') THEN RAISE EXCEPTION 'Work order access required'; END IF;
  IF (c IS NOT NULL AND c IS DISTINCT FROM linked.contact_id) OR (p IS NOT NULL AND p IS DISTINCT FROM linked.project_id) THEN RAISE EXCEPTION 'Inconsistent job context'; END IF;
  c:=linked.contact_id;p:=linked.project_id;
 END IF;
 IF p IS NOT NULL THEN
  SELECT contact_id INTO linked FROM public.projects WHERE id=p AND organization_id=p_org;
  IF NOT FOUND OR (w IS NULL AND NOT public.flow_has_module_access('projects')) THEN RAISE EXCEPTION 'Project access required'; END IF;
  IF c IS NOT NULL AND c IS DISTINCT FROM linked.contact_id THEN RAISE EXCEPTION 'Inconsistent customer context'; END IF;
  c:=linked.contact_id;
 END IF;
 IF c IS NULL OR NOT EXISTS(SELECT 1 FROM public.contacts WHERE id=c AND organization_id=p_org)
  OR (p IS NULL AND w IS NULL AND NOT public.flow_has_module_access('contacts')) THEN RAISE EXCEPTION 'Customer access required'; END IF;
 RETURN jsonb_build_object('contact_id',c,'project_id',p,'work_order_id',w);
END $$;
REVOKE ALL ON FUNCTION flow_private.interaction_context(jsonb,uuid) FROM PUBLIC,anon,authenticated;

-- A single interaction and its optional reminder/schedule are one transaction.
-- Legacy maintenance jobs omit organization_id; derive it from the schedule.
CREATE OR REPLACE FUNCTION flow_private.scope_occurrence()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s public.scheduled_connections%ROWTYPE;
BEGIN
 SELECT * INTO s FROM public.scheduled_connections WHERE id=NEW.scheduled_connection_id;
 IF s.id IS NULL OR (auth.uid() IS NOT NULL AND (s.created_by_user_id<>auth.uid() OR s.organization_id<>public.get_user_org_id())) THEN RAISE EXCEPTION 'Schedule unavailable'; END IF;
 IF NEW.prospect_id IS DISTINCT FROM s.prospect_id THEN RAISE EXCEPTION 'Inconsistent schedule customer'; END IF;
 NEW.organization_id:=s.organization_id;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION flow_private.scope_occurrence() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS a_flow_occurrence_scope ON public.scheduled_connection_occurrences;
CREATE TRIGGER a_flow_occurrence_scope BEFORE INSERT ON public.scheduled_connection_occurrences FOR EACH ROW EXECUTE FUNCTION flow_private.scope_occurrence();

-- Repair the legacy trigger's obsolete contact_id/created_by column references.
CREATE OR REPLACE FUNCTION public.send_scheduled_connection_notifications()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s public.scheduled_connections%ROWTYPE; customer_name text;
BEGIN
 IF NEW.scheduled_date>current_date OR NEW.is_completed OR NEW.is_skipped THEN RETURN NEW; END IF;
 SELECT * INTO s FROM public.scheduled_connections WHERE id=NEW.scheduled_connection_id AND organization_id=NEW.organization_id AND is_active;
 IF s.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=s.created_by_user_id AND organization_id=s.organization_id AND is_active) THEN RETURN NEW; END IF;
 SELECT full_name INTO customer_name FROM public.contacts WHERE id=s.prospect_id AND organization_id=s.organization_id;
 INSERT INTO public.notifications(organization_id,user_id,type,title,body,related_id)
 VALUES(s.organization_id,s.created_by_user_id,'system','Follow-up due',coalesce(customer_name,'Customer') || ': ' || coalesce(s.default_notes,'Scheduled follow-up') || ' (' || NEW.scheduled_date::text || ')',NEW.id);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.send_scheduled_connection_notifications() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.save_flow_interaction(p_scope jsonb,p_type text,p_notes text,p_date timestamptz,p_due timestamptz DEFAULT NULL,p_followup_notes text DEFAULT '',p_repeat text DEFAULT '')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE org uuid:=flow_private.require_followup_actor(); context jsonb; contact uuid; interaction uuid; schedule uuid; day date; horizon date;
BEGIN
 context:=flow_private.interaction_context(p_scope,org);contact:=(context->>'contact_id')::uuid;
 IF p_type IS NULL OR p_type NOT IN ('call','email','meeting','demo','site_visit','proposal_sent','follow_up','casual_conversation','other','check_in') OR p_date IS NULL OR coalesce(length(trim(p_notes)),0) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION 'Choose an interaction, date and notes'; END IF;
 IF coalesce(length(p_followup_notes),0)>500 OR p_repeat IS NULL OR p_repeat NOT IN ('','weekly','biweekly','monthly','quarterly') OR (p_repeat<>'' AND p_due IS NULL) THEN RAISE EXCEPTION 'Invalid follow-up'; END IF;
 INSERT INTO public.connections(organization_id,user_id,contact_id,connection_type,connection_date,notes,follow_up_needed,reminder_date,follow_up_description)
 VALUES(org,auth.uid(),contact,p_type,p_date,trim(p_notes),p_due IS NOT NULL AND p_repeat='',CASE WHEN p_repeat='' THEN p_due END,nullif(trim(p_followup_notes),'')) RETURNING id INTO interaction;
 -- Source events include the selected job context without creating a second log.
 UPDATE public.flow_events SET project_id=(context->>'project_id')::uuid,work_order_id=(context->>'work_order_id')::uuid,
 project_name=coalesce((SELECT name FROM public.projects WHERE id=(context->>'project_id')::uuid AND organization_id=org),''),
 work_order_number=coalesce((SELECT work_order_number FROM public.work_orders WHERE id=(context->>'work_order_id')::uuid AND organization_id=org),'')
 WHERE source_table='connections' AND source_id=interaction;
 IF p_repeat<>'' THEN
  INSERT INTO public.scheduled_connections(organization_id,prospect_id,created_by_user_id,connection_type,recurrence_pattern,recurrence_interval,schedule_start_date,default_notes,is_active)
   VALUES(org,contact,auth.uid(),p_type,p_repeat,1,p_due::date,coalesce(nullif(trim(p_followup_notes),''),'Follow up'),true) RETURNING id INTO schedule;
  day:=p_due::date;horizon:=greatest(current_date,p_due::date)+90;
  WHILE day<=horizon LOOP
   INSERT INTO public.scheduled_connection_occurrences(organization_id,scheduled_connection_id,prospect_id,scheduled_date,original_scheduled_date)
    VALUES(org,schedule,contact,day,day);
   UPDATE public.scheduled_connections SET last_occurrence_date=day,next_occurrence_date=day WHERE id=schedule;
   day:=public.calculate_next_occurrence_date(day,p_repeat,1,NULL);
  END LOOP;
 END IF;
 RETURN interaction;
END $$;
REVOKE ALL ON FUNCTION public.save_flow_interaction(jsonb,text,text,timestamptz,timestamptz,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_flow_interaction(jsonb,text,text,timestamptz,timestamptz,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_flow_followup(p_id uuid,p_kind text,p_notes text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE org uuid:=flow_private.require_followup_actor(); contact uuid; original public.connections; occurrence public.scheduled_connection_occurrences; schedule public.scheduled_connections; result uuid;
BEGIN
 IF p_kind='reminder' THEN
  SELECT * INTO original FROM public.connections WHERE id=p_id AND organization_id=org AND user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND OR NOT original.follow_up_needed OR original.completed_at IS NOT NULL THEN RAISE EXCEPTION 'Follow-up unavailable or already completed'; END IF;
  contact:=original.contact_id;
 ELSIF p_kind='schedule' THEN
  SELECT * INTO occurrence FROM public.scheduled_connection_occurrences WHERE id=p_id AND organization_id=org FOR UPDATE;
  IF NOT FOUND OR occurrence.is_completed OR occurrence.is_skipped THEN RAISE EXCEPTION 'Follow-up unavailable or already completed'; END IF;
  SELECT * INTO schedule FROM public.scheduled_connections WHERE id=occurrence.scheduled_connection_id AND organization_id=org AND created_by_user_id=auth.uid();
  IF NOT FOUND OR NOT schedule.is_active THEN RAISE EXCEPTION 'Schedule unavailable'; END IF;
  contact:=schedule.prospect_id;
 ELSE RAISE EXCEPTION 'Invalid follow-up type'; END IF;
 IF coalesce(length(trim(p_notes)),0) NOT BETWEEN 1 AND 4000 OR NOT EXISTS(SELECT 1 FROM public.contacts WHERE id=contact AND organization_id=org) THEN RAISE EXCEPTION 'Completion notes and a valid customer required'; END IF;
 INSERT INTO public.connections(organization_id,user_id,contact_id,connection_type,connection_date,notes,follow_up_needed) VALUES(org,auth.uid(),contact,'follow_up',now(),trim(p_notes),false) RETURNING id INTO result;
 IF p_kind='reminder' THEN UPDATE public.connections SET follow_up_needed=false,completed_at=now() WHERE id=p_id;
 ELSE UPDATE public.scheduled_connection_occurrences SET is_completed=true,completed_at=now(),connection_id=result WHERE id=p_id; END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.complete_flow_followup(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.complete_flow_followup(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_flow_schedule_active(p_id uuid,p_active boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE org uuid:=flow_private.require_followup_actor();
BEGIN
 IF p_active IS NULL THEN RAISE EXCEPTION 'Schedule state required'; END IF;
 UPDATE public.scheduled_connections SET is_active=p_active WHERE id=p_id AND organization_id=org AND created_by_user_id=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION 'Schedule unavailable'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.set_flow_schedule_active(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_flow_schedule_active(uuid,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_flow_followups(p_contact uuid DEFAULT NULL,p_project uuid DEFAULT NULL,p_work_order uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE org uuid:=flow_private.require_followup_actor(); contact uuid:=p_contact; context jsonb; items jsonb; schedules jsonb;
BEGIN
 IF num_nonnulls(p_contact,p_project,p_work_order)>0 THEN
  context:=flow_private.interaction_context(jsonb_build_object('contact_id',p_contact,'project_id',p_project,'work_order_id',p_work_order),org);contact:=(context->>'contact_id')::uuid;
 END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(item) ORDER BY due NULLS LAST,id),'[]'::jsonb) INTO items FROM (
  SELECT c.id,'reminder'::text kind,c.contact_id,coalesce(nullif(t.full_name,''),t.company_name,'Customer') label,c.connection_type type,c.reminder_date due,c.follow_up_description reason
   FROM public.connections c JOIN public.contacts t ON t.id=c.contact_id AND t.organization_id=org
   WHERE c.organization_id=org AND c.user_id=auth.uid() AND c.follow_up_needed AND c.completed_at IS NULL AND (contact IS NULL OR c.contact_id=contact)
  UNION ALL
  SELECT o.id,'schedule',s.prospect_id,coalesce(nullif(t.full_name,''),t.company_name,'Customer'),s.connection_type,o.scheduled_date::timestamptz,s.default_notes
   FROM public.scheduled_connection_occurrences o JOIN public.scheduled_connections s ON s.id=o.scheduled_connection_id AND s.organization_id=org
    JOIN public.contacts t ON t.id=s.prospect_id AND t.organization_id=org
   WHERE o.organization_id=org AND s.created_by_user_id=auth.uid() AND s.is_active AND NOT o.is_completed AND NOT o.is_skipped AND (contact IS NULL OR s.prospect_id=contact)
 ) item;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'label',coalesce(nullif(t.full_name,''),t.company_name,'Customer'),'recurrence_pattern',s.recurrence_pattern,'is_active',s.is_active) ORDER BY s.created_at DESC),'[]'::jsonb) INTO schedules
  FROM public.scheduled_connections s JOIN public.contacts t ON t.id=s.prospect_id AND t.organization_id=org
  WHERE s.organization_id=org AND s.created_by_user_id=auth.uid() AND (contact IS NULL OR s.prospect_id=contact);
 RETURN jsonb_build_object('items',items,'schedules',schedules);
END $$;
REVOKE ALL ON FUNCTION public.get_flow_followups(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_flow_followups(uuid,uuid,uuid) TO authenticated;

-- Captured entries retain their original dates and source IDs; reruns do not
-- duplicate history. This also handles older installations with activity_feed.
CREATE UNIQUE INDEX IF NOT EXISTS flow_interaction_source ON public.flow_events(source_table,source_id,event_type) WHERE source_table IN ('connections','activity_feed');
CREATE OR REPLACE FUNCTION flow_private.record_interaction(p_source text,n jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor uuid:=nullif(n->>'user_id','')::uuid; org uuid; contact uuid; meta jsonb:=coalesce(n->'metadata','{}'); label text; notes text; name text;
BEGIN
 SELECT organization_id,full_name INTO org,name FROM public.profiles WHERE id=actor;
 IF org IS NULL OR (n->>'organization_id' IS NOT NULL AND (n->>'organization_id')::uuid IS DISTINCT FROM org) THEN RETURN; END IF;
 contact:=coalesce(nullif(n->>'contact_id',''),nullif(meta->>'contact_id',''))::uuid;
 IF contact IS NOT NULL THEN SELECT coalesce(nullif(full_name,''),company_name,'Customer') INTO label FROM public.contacts WHERE id=contact AND organization_id=org;IF NOT FOUND THEN RETURN;END IF; END IF;
 notes:=coalesce(n->>'notes',meta->>'description',n->>'description','');
 INSERT INTO public.flow_events(organization_id,contact_id,actor_id,actor_name,customer_name,category,event_type,summary,details,source_table,source_id,required_module,created_at,is_internal)
 VALUES(org,contact,actor,coalesce(name,'Team member'),coalesce(label,'Sales activity'),'sales','interaction.logged',initcap(replace(coalesce(n->>'connection_type',n->>'type','Interaction'),'_',' '))||': '||left(notes,110),notes,p_source,(n->>'id')::uuid,'feed',coalesce((n->>'connection_date')::timestamptz,(n->>'created_at')::timestamptz,now()),false)
 ON CONFLICT DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION flow_private.record_interaction(text,jsonb) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION flow_private.capture_interaction()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN PERFORM flow_private.record_interaction(TG_TABLE_NAME,to_jsonb(NEW));RETURN NEW;END $$;
REVOKE ALL ON FUNCTION flow_private.capture_interaction() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS capture_flow_interaction ON public.connections;
CREATE TRIGGER capture_flow_interaction AFTER INSERT ON public.connections FOR EACH ROW EXECUTE FUNCTION flow_private.capture_interaction();
DO $$ DECLARE row jsonb; BEGIN
 FOR row IN SELECT to_jsonb(c) FROM public.connections c LOOP PERFORM flow_private.record_interaction('connections',row); END LOOP;
 IF to_regclass('public.activity_feed') IS NOT NULL THEN
  FOR row IN EXECUTE 'SELECT to_jsonb(a) FROM public.activity_feed a' LOOP PERFORM flow_private.record_interaction('activity_feed',row);END LOOP;
 END IF;
END $$;

-- Preserve the legacy owner-only interaction history, independent of general
-- customer/job event visibility. Existing conversation audience policies remain.
DROP POLICY IF EXISTS flow_interactions_owner ON public.flow_events;
CREATE POLICY flow_interactions_owner ON public.flow_events AS RESTRICTIVE FOR SELECT TO authenticated USING (
 EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.organization_id=flow_events.organization_id AND p.is_active)
 AND (source_table NOT IN ('connections','activity_feed') OR actor_id=auth.uid() OR EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role='admin')));

-- Retire only the standalone page grants. Roles/users with these capabilities
-- inherit Flow unless an explicit Flow revoke already exists.
INSERT INTO public.role_module_access(role_id,module_id,has_access,organization_id)
 SELECT DISTINCT a.role_id,feed.id,true,feed.organization_id FROM public.role_module_access a JOIN public.department_modules old ON old.id=a.module_id
 JOIN public.department_modules feed ON feed.organization_id=old.organization_id AND feed.module_key='feed' AND feed.is_active
 WHERE old.module_key IN ('connections','sales_activity') AND a.has_access
 ON CONFLICT(role_id,module_id) DO UPDATE SET has_access=true;
INSERT INTO public.user_permission_overrides(user_id,module_id,override_type,organization_id,notes)
 SELECT DISTINCT a.user_id,feed.id,'grant',feed.organization_id,'Flow replaces standalone interaction pages' FROM public.user_permission_overrides a JOIN public.department_modules old ON old.id=a.module_id
 JOIN public.department_modules feed ON feed.organization_id=old.organization_id AND feed.module_key='feed' AND feed.is_active
 WHERE old.module_key IN ('connections','sales_activity') AND a.override_type='grant'
 ON CONFLICT(user_id,module_id) DO NOTHING;
UPDATE public.department_modules SET is_active=false WHERE module_key IN ('connections','sales_activity');
CREATE OR REPLACE FUNCTION private.is_current_page_key(p_key text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT p_key IS NOT NULL AND p_key<>ALL(ARRAY['connections','sales_activity','preferences','by_office','proposal_messages_admin','company_settings','user_management','role_permissions','menu_builder','offices','priority_management','pay_types','integrations','department_access','unassigned_jobs','payments','job_costing','reports','quickbooks','feature_suggestions']);
$$;
NOTIFY pgrst,'reload schema';

-- Direct table access must not let a caller forge another user's interaction or
-- attach a schedule to a different tenant, even though the RPCs already scope it.
ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS flow_connection_owner ON public.connections;
CREATE POLICY flow_connection_owner ON public.connections AS RESTRICTIVE FOR ALL TO authenticated
 USING(user_id=auth.uid() AND organization_id=get_user_org_id() AND public.flow_has_module_access('feed'))
 WITH CHECK(user_id=auth.uid() AND organization_id=get_user_org_id() AND public.flow_has_module_access('feed') AND EXISTS(SELECT 1 FROM public.contacts c WHERE c.id=contact_id AND c.organization_id=connections.organization_id));
ALTER TABLE public.scheduled_connections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS flow_schedule_owner ON public.scheduled_connections;
CREATE POLICY flow_schedule_owner ON public.scheduled_connections AS RESTRICTIVE FOR ALL TO authenticated
 USING(created_by_user_id=auth.uid() AND organization_id=get_user_org_id() AND public.flow_has_module_access('feed'))
 WITH CHECK(created_by_user_id=auth.uid() AND organization_id=get_user_org_id() AND public.flow_has_module_access('feed') AND EXISTS(SELECT 1 FROM public.contacts c WHERE c.id=prospect_id AND c.organization_id=scheduled_connections.organization_id));
ALTER TABLE public.scheduled_connection_occurrences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS flow_occurrence_owner ON public.scheduled_connection_occurrences;
CREATE POLICY flow_occurrence_owner ON public.scheduled_connection_occurrences AS RESTRICTIVE FOR ALL TO authenticated
 USING(organization_id=get_user_org_id() AND EXISTS(SELECT 1 FROM public.scheduled_connections s WHERE s.id=scheduled_connection_id AND s.created_by_user_id=auth.uid() AND s.organization_id=scheduled_connection_occurrences.organization_id))
 WITH CHECK(organization_id=get_user_org_id() AND EXISTS(SELECT 1 FROM public.scheduled_connections s WHERE s.id=scheduled_connection_id AND s.created_by_user_id=auth.uid() AND s.organization_id=scheduled_connection_occurrences.organization_id AND s.prospect_id=scheduled_connection_occurrences.prospect_id));
NOTIFY pgrst,'reload schema';
