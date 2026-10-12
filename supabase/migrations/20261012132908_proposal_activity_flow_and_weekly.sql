-- One targeted first-open event per proposal; visits/clicks remain on Activity.
ALTER TABLE public.flow_events ADD COLUMN activity_recipient_user_id uuid;
CREATE UNIQUE INDEX flow_proposal_first_open ON public.flow_events(organization_id,source_id)
 WHERE source_table='proposals' AND event_type='proposal_first_opened';
CREATE POLICY flow_proposal_activity_recipient ON public.flow_events AS RESTRICTIVE FOR SELECT TO authenticated
 USING(event_type<>'proposal_first_opened' OR (
   activity_recipient_user_id=(SELECT auth.uid()) AND public.flow_has_module_access('feed')
   AND EXISTS(SELECT 1 FROM public.proposals p WHERE p.id=source_id AND p.organization_id=flow_events.organization_id)
 ));

CREATE FUNCTION private.capture_proposal_first_open() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.proposals; customer text;
BEGIN
 IF NEW.activity_type<>'viewed' OR NEW.viewer_user_id IS NULL OR NEW.visit_id IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO p FROM public.proposals WHERE id=NEW.proposal_id;
 IF p.id IS NULL OR EXISTS(SELECT 1 FROM public.proposal_activity a WHERE a.proposal_id=p.id AND a.activity_type='viewed' AND a.id<>NEW.id)
  OR NOT EXISTS(SELECT 1 FROM public.profiles rep WHERE rep.id=p.created_by AND rep.organization_id=p.organization_id AND rep.is_active AND rep.role<>'portal_user') THEN RETURN NEW; END IF;
 SELECT coalesce(nullif(full_name,''),nullif(contact_name,''),nullif(company_name,''),'Customer') INTO customer FROM public.contacts WHERE id=p.contact_id AND organization_id=p.organization_id;
 INSERT INTO public.flow_events(organization_id,contact_id,office_id,actor_id,actor_name,customer_name,category,event_type,summary,details,source_table,source_id,required_module,is_internal,activity_recipient_user_id,created_at)
 VALUES(p.organization_id,p.contact_id,p.office_id,NEW.viewer_user_id,coalesce(customer,'Customer'),coalesce(customer,'Customer'),'sales','proposal_first_opened',
  'Customer first opened proposal '||coalesce(p.proposal_number,''),coalesce(p.title,'')||' — View Activity for engagement details.',
  'proposals',p.id,'proposals',false,p.created_by,NEW.created_at)
 ON CONFLICT(organization_id,source_id) WHERE source_table='proposals' AND event_type='proposal_first_opened' DO NOTHING;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.capture_proposal_first_open() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER proposal_first_open_flow AFTER INSERT ON public.proposal_activity FOR EACH ROW EXECUTE FUNCTION private.capture_proposal_first_open();

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
  -- The authoritative log remains available in the work order. Its notes are not copied.
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
     -- Only allowlisted operational transitions, never arbitrary record JSON.
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
 coalesce(nullif(c->>'full_name',''),nullif(c->>'contact_name',''),nullif(c->>'company_name',''),'Customer'),
 coalesce(p->>'name',''),coalesce(w->>'work_order_number',''),
 coalesce((SELECT l.name FROM public.customer_locations l WHERE l.id=v_location AND l.customer_contact_id=v_contact),''),
 v_category,TG_TABLE_NAME||'.'||lower(TG_OP),v_summary,coalesce(v_details,''),TG_TABLE_NAME,NEW.id,v_module,v_internal);
 RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_flow_events(p_filters jsonb DEFAULT '{}'::jsonb, p_before bigint DEFAULT NULL::bigint, p_limit integer DEFAULT 50)
 RETURNS SETOF jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select to_jsonb(e)||jsonb_build_object(
  'viewed',v.event_id is not null,
  'preview',case e.source_table
   when 'messages' then (select left(m.body,140) from public.messages m where m.id=e.source_id)
   when 'discussion_posts' then (select left(d.content,140) from public.discussion_posts d where d.id=e.source_id)
   when 'task_comments' then (select left(tc.content,140) from public.task_comments tc where tc.id=e.source_id)
   else null end,
  'audience_type',case when e.source_table='discussion_posts'
    then (select coalesce(d.audience_type, case when coalesce(d.is_private,false) then 'direct' else 'company' end) from public.discussion_posts d where d.id=e.source_id)
    else null end,
  'audience_department_id',case when e.source_table='discussion_posts'
    then (select d.audience_department_id from public.discussion_posts d where d.id=e.source_id)
    else null end
 )
 from public.flow_events e left join public.flow_event_views v on v.event_id=e.id and v.user_id=(select auth.uid())
 where (p_before is null or e.id<p_before)
 and (nullif(p_filters->>'contact_id','') is null or e.contact_id=(p_filters->>'contact_id')::uuid)
 and (nullif(p_filters->>'project_id','') is null or e.project_id=(p_filters->>'project_id')::uuid)
 and (nullif(p_filters->>'work_order_id','') is null or e.work_order_id=(p_filters->>'work_order_id')::uuid)
 and (nullif(p_filters->>'location_id','') is null or e.customer_location_id=(p_filters->>'location_id')::uuid)
 and (nullif(p_filters->>'office_id','') is null or e.office_id=(p_filters->>'office_id')::uuid)
 and (nullif(p_filters->>'actor_id','') is null or e.actor_id=(p_filters->>'actor_id')::uuid)
 and (nullif(p_filters->>'category','') is null or e.category=p_filters->>'category')
 and (nullif(p_filters->>'source_id','') is null or e.source_table='flow_updates' and e.source_id=(p_filters->>'source_id')::uuid)
 and (nullif(p_filters->>'kind','') is null or case p_filters->>'kind'
  when 'messages' then e.source_table='messages'
  when 'discussions' then e.source_table='discussion_posts'
  when 'tasks' then e.source_table in ('tasks','task_comments')
  when 'updates' then e.category='update'
  when 'activity' then e.source_table not in ('messages','discussion_posts','tasks','task_comments') and e.category<>'update'
  else false end)
 and (nullif(p_filters->>'since','') is null or e.created_at>=(p_filters->>'since')::timestamptz)
 and (nullif(p_filters->>'until','') is null or e.created_at<(p_filters->>'until')::timestamptz)
 and (not coalesce((p_filters->>'new_only')::boolean,false) or v.event_id is null)
 and (nullif(trim(p_filters->>'search'),'') is null or
  position(lower(trim(p_filters->>'search')) in lower(concat_ws(' ',e.customer_name,e.project_name,e.work_order_number,e.location_name,e.summary,e.actor_name)))>0)
 and (not coalesce((p_filters->>'mentions_only')::boolean,false) or (select auth.uid())=any(e.mentioned_user_ids))
 and (not coalesce((p_filters->>'my_work')::boolean,false) or e.activity_recipient_user_id=(select auth.uid()) or e.actor_id=(select auth.uid())
  or (select auth.uid())=any(e.mentioned_user_ids)
  or (e.source_table='discussion_posts' and exists (
    select 1 from public.discussion_posts d where d.id=e.source_id and ((select auth.uid()) in (d.user_id,d.assigned_to) or (select auth.uid())=any(d.audience_user_ids))))
  or (e.source_table='messages' and exists (
   select 1 from public.message_threads t where t.id=e.thread_id and t.organization_id=e.organization_id
    and (t.created_by=(select auth.uid()) or t.assigned_sales_rep_id=(select auth.uid())
     or (t.context_type not in ('project','work_order') and exists (select 1 from public.contacts c where c.id=t.contact_id and c.assigned_to=(select auth.uid())))
     or exists (select 1 from public.projects p where p.organization_id=t.organization_id
       and (t.context_type='project' and p.id=t.context_id or t.context_type not in ('project','work_order') and p.contact_id=t.contact_id)
       and (select auth.uid()) in (p.assigned_pm,p.salesperson_id,p.designer_id))
     or exists (select 1 from public.work_orders w where w.organization_id=t.organization_id
       and (t.context_type='work_order' and w.id=t.context_id or t.context_type not in ('project','work_order') and w.contact_id=t.contact_id)
       and (select auth.uid()) in (w.assigned_to,w.customer_sales_rep_id))
     or exists (select 1 from public.profiles me where me.id=(select auth.uid())
       and me.role='service_manager' and t.context_type in ('work_order','service_request')))))
  or exists (select 1 from public.projects p where p.id=e.project_id and p.organization_id=e.organization_id and (select auth.uid()) in (p.assigned_pm,p.salesperson_id,p.designer_id))
  or exists (select 1 from public.work_orders w where w.organization_id=e.organization_id and (w.id=e.work_order_id or (e.project_id is not null and w.project_id=e.project_id)) and (select auth.uid()) in (w.assigned_to,w.customer_sales_rep_id))
  or (e.project_id is null and e.work_order_id is null and exists (select 1 from public.contacts c where c.id=e.contact_id and c.organization_id=e.organization_id and c.assigned_to=(select auth.uid())))
 )
 order by e.id desc limit least(greatest(p_limit,1),100);
$function$;


-- Reports are private to their assigned rep; only the server worker can create/send them.
CREATE TABLE public.proposal_activity_weekly_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 recipient_user_id uuid NOT NULL REFERENCES public.profiles(id),
 week_start date NOT NULL,
 timezone text NOT NULL,
 period_start timestamptz NOT NULL,
 period_end timestamptz NOT NULL,
 report_data jsonb NOT NULL,
 email_payload jsonb,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','processing','sent','failed','skipped')),
 attempts integer NOT NULL DEFAULT 0,
 available_at timestamptz NOT NULL DEFAULT now(),
 lease_until timestamptz,
 lease_token uuid,
 sent_at timestamptz,
 error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,recipient_user_id,week_start)
);
ALTER TABLE public.proposal_activity_weekly_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY proposal_weekly_report_read ON public.proposal_activity_weekly_reports FOR SELECT TO authenticated
 USING(recipient_user_id=(SELECT auth.uid()) AND organization_id=public.get_user_org_id() AND public.user_has_module_access(auth.uid(),'proposals'));
REVOKE ALL ON public.proposal_activity_weekly_reports FROM PUBLIC,anon,authenticated;
-- Prepared outbound payloads include delivery addresses; do not expose them to the browser.
GRANT SELECT(id,organization_id,recipient_user_id,week_start,timezone,period_start,period_end,status,attempts,sent_at,error,created_at) ON public.proposal_activity_weekly_reports TO authenticated;
GRANT ALL ON public.proposal_activity_weekly_reports TO service_role;

CREATE FUNCTION private.proposal_weekly_data(p_org uuid,p_rep uuid,p_start timestamptz,p_end timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 WITH owned AS (
  SELECT p.*,coalesce(nullif(c.full_name,''),nullif(c.contact_name,''),nullif(c.company_name,''),'Customer') customer_name
  FROM public.proposals p JOIN public.contacts c ON c.id=p.contact_id AND c.organization_id=p.organization_id
  WHERE p.organization_id=p_org AND p.created_by=p_rep AND p.is_active_revision AND p.status<>'archived'
    AND EXISTS(SELECT 1 FROM public.profiles rep WHERE rep.id=p_rep AND rep.organization_id=p_org AND rep.is_active AND rep.role<>'portal_user')
    AND private.can_access_page(p_rep,'proposals')
 ), metrics AS (
  SELECT p.id,count(a.id) FILTER(WHERE a.created_at>=p_start AND a.created_at<p_end) visits,
    max(a.created_at) FILTER(WHERE a.created_at>=p_start AND a.created_at<p_end) last_viewed_at,
    coalesce(sum(a.duration_seconds) FILTER(WHERE a.created_at>=p_start AND a.created_at<p_end AND a.metadata->'engagement'->>'trackingVersion'='1'),0) active_seconds,
    count(a.id) lifetime_views
  FROM owned p LEFT JOIN public.proposal_activity a ON a.proposal_id=p.id AND a.activity_type='viewed' GROUP BY p.id
 ), selected AS (
  SELECT p.*,m.visits,m.last_viewed_at,m.active_seconds,
    CASE WHEN m.visits>0 THEN 'engaged' ELSE 'unopened' END bucket
  FROM owned p JOIN metrics m ON m.id=p.id
  WHERE m.visits>0 OR (m.lifetime_views=0 AND p.is_portal_visible AND p.sent_at IS NOT NULL AND p.sent_at<p_end AND p.status IN('sent','portal'))
 ), section_totals AS (
  SELECT p.id,s.key,sum(s.value::integer) seconds
  FROM selected p JOIN public.proposal_activity a ON a.proposal_id=p.id AND a.activity_type='viewed'
  CROSS JOIN LATERAL jsonb_each_text(CASE WHEN jsonb_typeof(a.metadata->'engagement'->'sections')='object' THEN a.metadata->'engagement'->'sections' ELSE '{}' END) s
  WHERE a.created_at>=p_start AND a.created_at<p_end AND a.metadata->'engagement'->>'trackingVersion'='1' AND s.value~'^\d{1,5}$'
  GROUP BY p.id,s.key
 ), sections AS (
  SELECT t.id,jsonb_agg(jsonb_build_object('key',t.key,'seconds',t.seconds,'label',coalesce(r.name,
    CASE t.key WHEN 'scope' THEN 'Scope' WHEN 'pricing' THEN 'Pricing' WHEN 'actions' THEN 'Approval and questions' WHEN 'notes' THEN 'Additional notes' WHEN 'video' THEN 'Proposal video' ELSE 'Room / area' END)) ORDER BY t.seconds DESC,t.key) items
  FROM section_totals t LEFT JOIN public.proposal_rooms r ON 'room:'||r.id::text=t.key AND r.proposal_id=t.id
  WHERE t.seconds>0 GROUP BY t.id
 ), click_totals AS (
  SELECT p.id,c.key,sum(c.value::integer) clicks
  FROM selected p JOIN public.proposal_activity a ON a.proposal_id=p.id AND a.activity_type='viewed'
  CROSS JOIN LATERAL jsonb_each_text(CASE WHEN jsonb_typeof(a.metadata->'engagement'->'clicks')='object' THEN a.metadata->'engagement'->'clicks' ELSE '{}' END) c
  WHERE a.created_at>=p_start AND a.created_at<p_end AND a.metadata->'engagement'->>'trackingVersion'='1' AND c.value~'^\d{1,5}$'
  GROUP BY p.id,c.key
 ), clicks AS (SELECT id,jsonb_object_agg(key,clicks) items FROM click_totals GROUP BY id)
 SELECT coalesce(jsonb_agg(jsonb_build_object('proposal_id',p.id,'proposal_number',p.proposal_number,'title',p.title,'customer',p.customer_name,
   'bucket',p.bucket,'visits',p.visits,'last_viewed_at',p.last_viewed_at,'active_seconds',p.active_seconds,
   'sections',coalesce(s.items,'[]'),'clicks',coalesce(c.items,'{}'))
   ORDER BY p.visits DESC,p.last_viewed_at DESC NULLS LAST,p.proposal_number),'[]')
 FROM selected p LEFT JOIN sections s ON s.id=p.id LEFT JOIN clicks c ON c.id=p.id;
$$;
REVOKE ALL ON FUNCTION private.proposal_weekly_data(uuid,uuid,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated,service_role;

-- Organization-local week boundaries account for DST; one due window per calendar week.
CREATE FUNCTION private.proposal_activity_report_window(p_timezone text,p_now timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 WITH zone AS (SELECT CASE WHEN EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=p_timezone) THEN p_timezone ELSE 'America/Chicago' END tz),
 local AS (SELECT tz,p_now AT TIME ZONE tz local_now FROM zone),
 week AS (SELECT tz,local_now,date_trunc('week',local_now)::date-7 start_day FROM local)
 SELECT jsonb_build_object('timezone',tz,'week_start',start_day,'period_start',start_day::timestamp AT TIME ZONE tz,
  'period_end',(start_day+7)::timestamp AT TIME ZONE tz,'due',local_now >= (start_day+7)::timestamp+interval '8 hours') FROM week;
$$;
REVOKE ALL ON FUNCTION private.proposal_activity_report_window(text,timestamptz) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.proposal_activity_weekly_worker(p_action text,p_id uuid DEFAULT NULL,p_lease uuid DEFAULT NULL,p_payload jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE candidate record; report public.proposal_activity_weekly_reports; tz text;
 start_day date; start_at timestamptz; end_at timestamptz; content jsonb; generated integer=0; rep public.profiles; report_window jsonb;
BEGIN
 IF p_action='generate' THEN
  FOR candidate IN SELECT employee.id rep_id,employee.organization_id,org.timezone FROM public.profiles employee
    JOIN public.organizations org ON org.id=employee.organization_id
    WHERE employee.is_active AND employee.role<>'portal_user' AND nullif(trim(employee.email),'') IS NOT NULL
      AND EXISTS(SELECT 1 FROM public.proposals p WHERE p.created_by=employee.id AND p.organization_id=employee.organization_id AND p.is_active_revision AND p.status<>'archived')
  LOOP
   report_window=private.proposal_activity_report_window(candidate.timezone,clock_timestamp());
   tz=report_window->>'timezone';start_day=(report_window->>'week_start')::date;
   -- Monday at 8am; a late worker catches up once for the current week, never backfills old weeks.
   IF NOT (report_window->>'due')::boolean OR EXISTS(
    SELECT 1 FROM public.proposal_activity_weekly_reports WHERE organization_id=candidate.organization_id AND recipient_user_id=candidate.rep_id AND week_start=start_day) THEN CONTINUE; END IF;
   start_at=start_day::timestamp AT TIME ZONE tz;end_at=(start_day+7)::timestamp AT TIME ZONE tz;
   content=private.proposal_weekly_data(candidate.organization_id,candidate.rep_id,start_at,end_at);
   IF jsonb_array_length(content)=0 THEN CONTINUE; END IF;
   INSERT INTO public.proposal_activity_weekly_reports(organization_id,recipient_user_id,week_start,timezone,period_start,period_end,report_data)
   VALUES(candidate.organization_id,candidate.rep_id,start_day,tz,start_at,end_at,content) ON CONFLICT DO NOTHING;
   IF FOUND THEN generated=generated+1; END IF;
  END LOOP;
  RETURN to_jsonb(generated);
 END IF;
 IF p_action='claim' THEN
  UPDATE public.proposal_activity_weekly_reports SET status='skipped',error='Delivery retry window expired',lease_until=NULL,lease_token=NULL
   WHERE status IN('pending','failed','processing') AND created_at<clock_timestamp()-interval '23 hours';
  LOOP
   SELECT * INTO report FROM public.proposal_activity_weekly_reports WHERE attempts<5 AND available_at<=clock_timestamp()
     AND (status IN('pending','failed') OR (status='processing' AND lease_until<clock_timestamp()))
     ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1;
   IF NOT FOUND THEN RETURN NULL; END IF;
   SELECT * INTO rep FROM public.profiles WHERE id=report.recipient_user_id AND organization_id=report.organization_id AND is_active AND role<>'portal_user';
   IF rep.id IS NULL OR nullif(trim(rep.email),'') IS NULL OR NOT private.can_access_page(rep.id,'proposals')
     OR EXISTS(SELECT 1 FROM jsonb_array_elements(report.report_data) item WHERE NOT EXISTS(
       SELECT 1 FROM public.proposals p WHERE p.id=(item->>'proposal_id')::uuid AND p.organization_id=report.organization_id AND p.created_by=rep.id AND p.is_active_revision AND p.status<>'archived'))
     OR (report.email_payload IS NOT NULL AND report.email_payload->'to'->>0 IS DISTINCT FROM rep.email) THEN
    UPDATE public.proposal_activity_weekly_reports SET status='skipped',error='Recipient access or proposal assignment changed',lease_until=NULL,lease_token=NULL WHERE id=report.id;
    CONTINUE;
   END IF;
   UPDATE public.proposal_activity_weekly_reports SET status='processing',attempts=attempts+1,lease_until=clock_timestamp()+interval '5 minutes',lease_token=gen_random_uuid()
    WHERE id=report.id RETURNING * INTO report;
   RETURN to_jsonb(report)||jsonb_build_object('recipient_email',rep.email,'recipient_name',rep.full_name);
  END LOOP;
 END IF;
 SELECT * INTO report FROM public.proposal_activity_weekly_reports WHERE id=p_id AND status='processing' AND lease_token=p_lease AND lease_until>=clock_timestamp() FOR UPDATE;
 IF report.id IS NULL THEN RAISE EXCEPTION 'Report lease unavailable' USING ERRCODE='42501'; END IF;
 IF p_action='store_payload' THEN
  IF report.email_payload IS NULL THEN
   IF jsonb_typeof(p_payload->'to') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'to')<>1 THEN RAISE EXCEPTION 'Invalid report recipient'; END IF;
   SELECT * INTO rep FROM public.profiles WHERE id=report.recipient_user_id AND organization_id=report.organization_id AND is_active;
   IF rep.id IS NULL OR p_payload->'to'->>0 IS DISTINCT FROM rep.email OR NOT private.can_access_page(rep.id,'proposals')
     OR EXISTS(SELECT 1 FROM jsonb_array_elements(report.report_data) item WHERE NOT EXISTS(
       SELECT 1 FROM public.proposals p WHERE p.id=(item->>'proposal_id')::uuid AND p.organization_id=report.organization_id AND p.created_by=rep.id AND p.is_active_revision AND p.status<>'archived'))
     THEN RAISE EXCEPTION 'Report recipient or proposal access changed'; END IF;
   UPDATE public.proposal_activity_weekly_reports SET email_payload=p_payload WHERE id=report.id;
   RETURN p_payload;
  END IF;
  RETURN report.email_payload;
 ELSIF p_action='sent' THEN
  UPDATE public.proposal_activity_weekly_reports SET status='sent',sent_at=clock_timestamp(),lease_until=NULL,lease_token=NULL,error=NULL WHERE id=report.id;
 ELSIF p_action='failed' THEN
  UPDATE public.proposal_activity_weekly_reports SET status='failed',error=left(coalesce(p_payload->>'error','Report delivery failed'),500),available_at=clock_timestamp()+interval '5 minutes'*power(2,least(attempts,4)),lease_until=NULL,lease_token=NULL WHERE id=report.id;
 ELSE RAISE EXCEPTION 'Unknown report worker action'; END IF;
 RETURN to_jsonb(true);
END $$;
REVOKE ALL ON FUNCTION private.proposal_activity_weekly_worker(text,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.proposal_activity_weekly_worker(text,uuid,uuid,jsonb) TO service_role;
CREATE FUNCTION public.proposal_activity_weekly_worker(p_action text,p_id uuid DEFAULT NULL,p_lease uuid DEFAULT NULL,p_payload jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.proposal_activity_weekly_worker(p_action,p_id,p_lease,p_payload); $$;
REVOKE ALL ON FUNCTION public.proposal_activity_weekly_worker(text,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.proposal_activity_weekly_worker(text,uuid,uuid,jsonb) TO service_role;
