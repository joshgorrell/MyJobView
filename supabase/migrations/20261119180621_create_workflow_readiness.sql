ALTER TABLE public.tasks ADD COLUMN is_support_request boolean NOT NULL DEFAULT false;

-- Older support requests used the title prefix and required a customer.
UPDATE public.tasks
SET is_support_request = true
WHERE contact_id IS NOT NULL AND title ~* '^Support:';

CREATE OR REPLACE FUNCTION flow_private.capture_assignment_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := coalesce(auth.uid(), NEW.user_id);
  actor_name text;
  customer_name text;
  label text := CASE WHEN NEW.is_support_request THEN 'Support request' ELSE 'Assignment' END;
  subject text := CASE WHEN NEW.is_support_request THEN regexp_replace(NEW.title, '^Support:[[:space:]]*', '', 'i') ELSE NEW.title END;
  action text;
BEGIN
  IF NEW.organization_id IS NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    action := 'created';
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    action := replace(NEW.status, '_', ' ');
  ELSIF (NEW.assigned_to, NEW.assigned_department_id) IS DISTINCT FROM
        (OLD.assigned_to, OLD.assigned_department_id) THEN
    action := 'reassigned';
  ELSE
    RETURN NEW;
  END IF;

  SELECT p.full_name INTO actor_name FROM public.profiles p
    WHERE p.id = actor AND p.organization_id = NEW.organization_id;
  SELECT coalesce(nullif(c.full_name, ''), nullif(c.contact_name, ''), nullif(c.company_name, ''), 'Customer')
    INTO customer_name FROM public.contacts c
    WHERE c.id = NEW.contact_id AND c.organization_id = NEW.organization_id;

  INSERT INTO public.flow_events (
    organization_id, contact_id, project_id, work_order_id, actor_id, actor_name,
    customer_name, category, event_type, summary, source_table, source_id,
    required_module, task_id, created_at
  ) VALUES (
    NEW.organization_id, NEW.contact_id, NEW.project_id, NEW.work_order_id, actor,
    coalesce(actor_name, 'Team member'), coalesce(customer_name, 'Team'),
    'communication', 'tasks.' || lower(TG_OP), label || ' ' || action || ': ' || left(subject, 90),
    'tasks', NEW.id, 'tasks', NEW.id,
    CASE WHEN TG_OP = 'INSERT' THEN coalesce(NEW.created_at, statement_timestamp()) ELSE statement_timestamp() END
  );
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION flow_private.capture_assignment_activity() FROM PUBLIC, anon, authenticated;

DROP TRIGGER capture_task_flow ON public.tasks;
CREATE TRIGGER capture_task_flow AFTER INSERT OR UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION flow_private.capture_assignment_activity();

-- Apply the same audience as the underlying assignment, including old Flow events.
CREATE POLICY flow_assignment_scope ON public.flow_events AS RESTRICTIVE FOR SELECT TO authenticated
USING (
  source_table NOT IN ('tasks', 'task_comments') OR EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = coalesce(flow_events.task_id, flow_events.source_id)
      AND t.organization_id = flow_events.organization_id
  )
);

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
  or (e.source_table in ('tasks','task_comments') and exists (
    select 1 from public.tasks t where t.id=e.task_id and t.organization_id=e.organization_id
      and ((select auth.uid()) in (t.user_id,t.assigned_to,t.claimed_by)
        or t.assigned_department_id in (select department_id from public.get_my_task_department_ids()))))
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

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime' AND NOT puballtables)
    AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime'
                    AND schemaname = 'public' AND tablename = 'tasks') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_service_managers_new_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_punchlist boolean := NEW.source_type='punchlist' OR NEW.notes ILIKE '%Created from customer punchlist portal%';
BEGIN
  INSERT INTO public.notifications (user_id,organization_id,title,body,type,related_id,is_read,created_at)
  SELECT p.id,NEW.organization_id,
    CASE WHEN v_punchlist THEN 'New Punchlist Service Request' ELSE 'New Service Request' END,
    CASE WHEN v_punchlist THEN 'Customer ' || NEW.customer_name || ' requested service for punchlist items'
         ELSE 'Service request from ' || NEW.customer_name || ': ' || left(NEW.job_description,100) END,
    CASE WHEN v_punchlist THEN 'punchlist_service_request' ELSE 'service_request_created' END,
    NEW.id,false,now()
  FROM public.profiles p WHERE p.organization_id=NEW.organization_id AND p.role='service_manager' AND p.is_active;
  RETURN NEW;
END;
$$;

-- Some older notifications stored a work order ID. Repair only unambiguous links.
WITH request_links AS (
  SELECT organization_id, work_order_id, (array_agg(id))[1] AS request_id
  FROM public.service_requests
  WHERE work_order_id IS NOT NULL
  GROUP BY organization_id, work_order_id
  HAVING count(*) = 1
)
UPDATE public.notifications n
SET related_id = l.request_id
FROM request_links l
WHERE n.organization_id = l.organization_id AND n.related_id = l.work_order_id
  AND n.type IN ('service_request_created', 'punchlist_service_request')
  AND NOT EXISTS (
    SELECT 1 FROM public.service_requests s WHERE s.id = n.related_id AND s.organization_id = n.organization_id
  );

CREATE OR REPLACE FUNCTION public.notify_managers_service_request_resubmitted()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.status = 'open' AND OLD.status = 'needs_more_info' THEN
    INSERT INTO public.notifications (user_id, organization_id, title, body, type, related_id, is_read, created_at)
    SELECT p.id, NEW.organization_id, 'Service Request Updated & Resubmitted',
      coalesce(creator.full_name, 'A team member') || ' has updated and resubmitted the service request for ' || NEW.customer_name,
      'service_request_resubmitted', NEW.id, false, now()
    FROM public.profiles p
    LEFT JOIN public.profiles creator ON creator.id = NEW.created_by AND creator.organization_id = NEW.organization_id
    WHERE p.organization_id = NEW.organization_id AND p.role IN ('service_manager', 'admin') AND p.is_active;
  END IF;
  RETURN NEW;
END;
$$;
