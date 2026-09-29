-- Extend Flow with customer conversations. Message bodies stay in messages; the
-- activity row contains only a label, and opening it loads the authoritative thread.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS can_view_all_messages boolean NOT NULL DEFAULT false;
-- The profile owner may edit their own preferences, but cannot grant this permission.
CREATE OR REPLACE FUNCTION flow_private.guard_all_messages_permission() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF NEW.can_view_all_messages IS DISTINCT FROM OLD.can_view_all_messages
  AND auth.uid() IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid()
    AND p.organization_id=NEW.organization_id AND p.role='admin') THEN
  RAISE EXCEPTION 'Only an organization admin can change conversation oversight access';
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION flow_private.guard_all_messages_permission() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_all_messages_permission BEFORE UPDATE ON public.profiles
 FOR EACH ROW EXECUTE FUNCTION flow_private.guard_all_messages_permission();
ALTER TABLE public.flow_events ADD COLUMN IF NOT EXISTS thread_id uuid;
ALTER TABLE public.flow_events ADD COLUMN IF NOT EXISTS task_id uuid;
ALTER TABLE public.flow_events ADD COLUMN IF NOT EXISTS mentioned_user_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE public.flow_events DROP CONSTRAINT IF EXISTS flow_events_category_check;
ALTER TABLE public.flow_events ADD CONSTRAINT flow_events_category_check
 CHECK (category IN ('work','service','sales','materials','scheduling','customer','financial','update','communication'));
CREATE INDEX IF NOT EXISTS flow_events_thread ON public.flow_events(thread_id) WHERE thread_id IS NOT NULL;

-- A staff member follows their assigned customer through sales, project, and
-- service. Executive access is an explicit per-user permission, not a role name.
CREATE OR REPLACE FUNCTION public.flow_can_view_thread(p_thread uuid, p_user uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS (
  SELECT 1 FROM public.message_threads t
  JOIN public.profiles me ON me.id=p_user AND me.organization_id=t.organization_id AND me.contact_id IS NULL
  WHERE t.id=p_thread AND (
   me.role='admin' OR me.can_view_all_messages
   OR (me.role='service_manager' AND t.context_type IN ('work_order','service_request'))
   OR t.created_by=p_user OR t.assigned_sales_rep_id=p_user
   OR EXISTS (SELECT 1 FROM public.contacts c WHERE c.id=t.contact_id AND c.organization_id=t.organization_id AND c.assigned_to=p_user)
   OR EXISTS (SELECT 1 FROM public.proposals p WHERE p.id=t.proposal_id AND p.organization_id=t.organization_id AND p.created_by=p_user)
   OR EXISTS (SELECT 1 FROM public.projects p WHERE p.organization_id=t.organization_id
       AND (t.context_type='project' AND p.id=t.context_id OR t.context_type NOT IN ('project','work_order') AND p.contact_id=t.contact_id)
       AND p_user IN (p.assigned_pm,p.salesperson_id,p.designer_id))
   OR EXISTS (SELECT 1 FROM public.work_orders w WHERE w.organization_id=t.organization_id
       AND (t.context_type='work_order' AND w.id=t.context_id OR t.context_type NOT IN ('project','work_order') AND w.contact_id=t.contact_id)
       AND p_user IN (w.assigned_to,w.customer_sales_rep_id))
  )
 );
$$;
REVOKE ALL ON FUNCTION public.flow_can_view_thread(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.flow_can_view_thread(uuid,uuid) TO authenticated;

-- These former same-organization staff policies exposed unrelated threads.
DROP POLICY IF EXISTS message_threads_select_same_org ON public.message_threads;
CREATE POLICY message_threads_select_related ON public.message_threads FOR SELECT TO authenticated
 USING (public.flow_can_view_thread(id));
DROP POLICY IF EXISTS messages_select_same_org ON public.messages;
CREATE POLICY messages_select_related ON public.messages FOR SELECT TO authenticated
 USING (EXISTS (SELECT 1 FROM public.message_threads t WHERE t.id=thread_id AND public.flow_can_view_thread(t.id)));
-- Public threads can contain staff-only notes; the portal must not read those rows.
DROP POLICY IF EXISTS "Portal users can view messages in their public threads" ON public.messages;
CREATE POLICY messages_portal_public_only ON public.messages FOR SELECT TO authenticated USING (
 NOT is_internal AND EXISTS (
  SELECT 1 FROM public.message_threads t WHERE t.id=thread_id AND t.visibility='public'
   AND (EXISTS (SELECT 1 FROM public.contacts c WHERE c.id=t.contact_id AND c.portal_user_id=(SELECT auth.uid()))
     OR (t.context_type='contact' AND EXISTS (SELECT 1 FROM public.contacts c WHERE c.id=t.context_id AND c.portal_user_id=(SELECT auth.uid())))
     OR (t.context_type='proposal' AND EXISTS (SELECT 1 FROM public.proposals p JOIN public.contacts c ON c.id=p.contact_id WHERE p.id=t.context_id AND c.portal_user_id=(SELECT auth.uid())))
     OR (t.context_type='project' AND EXISTS (SELECT 1 FROM public.projects p JOIN public.contacts c ON c.id=p.contact_id WHERE p.id=t.context_id AND c.portal_user_id=(SELECT auth.uid()))))
  )
);

DROP POLICY IF EXISTS flow_events_read ON public.flow_events;
CREATE POLICY flow_events_read ON public.flow_events FOR SELECT TO authenticated USING (
 organization_id=(SELECT public.get_user_org_id())
 AND CASE WHEN source_table='messages' THEN thread_id IS NOT NULL AND public.flow_can_view_thread(thread_id)
 WHEN source_table='discussion_posts' THEN public.flow_has_module_access('feed') AND EXISTS (
  SELECT 1 FROM public.discussion_posts d WHERE d.id=source_id AND d.organization_id=flow_events.organization_id
    AND (NOT coalesce(d.is_private,false) OR (SELECT auth.uid()) IN (d.user_id,d.assigned_to)
      OR (SELECT auth.uid())::text=ANY(d.mentions)))
 ELSE public.flow_has_module_access(required_module)
   AND (NOT is_internal OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid())
     AND p.role IN ('admin','manager','service_manager','production_manager'))) END
);

CREATE OR REPLACE FUNCTION flow_private.capture_message() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 t public.message_threads%ROWTYPE; c public.contacts%ROWTYPE; p public.projects%ROWTYPE;
 v_contact uuid; v_project uuid; v_wo uuid; v_office uuid; v_mentions uuid[];
BEGIN
 SELECT * INTO t FROM public.message_threads WHERE id=NEW.thread_id AND organization_id=NEW.organization_id;
 IF NOT FOUND THEN RETURN NEW; END IF;
 v_contact=t.contact_id;
 IF t.proposal_id IS NOT NULL THEN
  SELECT contact_id INTO v_contact FROM public.proposals WHERE id=t.proposal_id AND organization_id=t.organization_id;
  v_contact=coalesce(v_contact,t.contact_id);
 END IF;
 IF t.context_type='project' THEN v_project=t.context_id;
 ELSIF t.context_type='work_order' THEN v_wo=t.context_id;
 ELSIF t.context_type='contact' THEN v_contact=coalesce(v_contact,t.context_id);
 END IF;
 IF v_wo IS NOT NULL THEN
  SELECT project_id,contact_id INTO v_project,v_contact FROM public.work_orders WHERE id=v_wo AND organization_id=t.organization_id;
 END IF;
 IF v_project IS NOT NULL THEN
  SELECT * INTO p FROM public.projects WHERE id=v_project AND organization_id=t.organization_id;
  v_contact=coalesce(v_contact,p.contact_id);
 END IF;
 IF v_contact IS NOT NULL THEN
  SELECT * INTO c FROM public.contacts WHERE id=v_contact AND organization_id=t.organization_id;
  v_office=c.office_id;
 END IF;
 -- Only staff messages can call out colleagues. Resolve exact @handles.
 IF NEW.author_type='staff' THEN
  SELECT coalesce(array_agg(DISTINCT u.id),'{}'::uuid[]) INTO v_mentions
  FROM regexp_matches(NEW.body,'(^|[^[:alnum:]_])@([[:alnum:]_]+)','g') match
  JOIN public.profiles u ON lower(u.username)=lower(match[2]) AND u.organization_id=t.organization_id
  WHERE u.id IS DISTINCT FROM NEW.author_id AND public.flow_can_view_thread(t.id,u.id);
 ELSE v_mentions='{}'::uuid[]; END IF;
 INSERT INTO public.flow_events(organization_id,contact_id,project_id,work_order_id,office_id,
  actor_id,actor_name,customer_name,project_name,work_order_number,category,event_type,summary,
  details,source_table,source_id,required_module,is_internal,thread_id,mentioned_user_ids,created_at)
 VALUES(t.organization_id,v_contact,v_project,v_wo,v_office,
  NEW.author_id,coalesce(nullif(NEW.author_name,''),'Customer'),
  coalesce(nullif(c.full_name,''),nullif(c.contact_name,''),nullif(c.company_name,''),'Customer'),
  coalesce(p.name,''),coalesce((SELECT w.work_order_number FROM public.work_orders w WHERE w.id=v_wo),''),
  'communication','message.created',
  CASE WHEN NEW.author_type='customer' THEN 'Customer replied' WHEN NEW.is_internal THEN 'Internal message' ELSE 'Team replied to customer' END,
  'Open the conversation to read the message in context.',
  'messages',NEW.id,'messages',coalesce(NEW.is_internal,false),t.id,v_mentions,coalesce(NEW.created_at,now()));
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION flow_private.capture_message() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER capture_message_flow AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION flow_private.capture_message();

-- Existing message mention notifications use a dedicated type and thread link.
CREATE OR REPLACE FUNCTION flow_private.notify_message_mentions() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user uuid;
BEGIN
 IF NEW.source_table IN ('messages','discussion_posts') THEN
  FOREACH v_user IN ARRAY NEW.mentioned_user_ids LOOP
   INSERT INTO public.notifications(organization_id,user_id,type,title,body,related_id,is_read)
   VALUES(NEW.organization_id,v_user,
     CASE WHEN NEW.source_table='messages' THEN 'message_mention' ELSE 'discussion_post_mention' END,
     'You were mentioned',NEW.actor_name||' mentioned you. Open the conversation for context.',
     CASE WHEN NEW.source_table='messages' THEN NEW.thread_id ELSE NEW.source_id END,false);
  END LOOP;
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION flow_private.notify_message_mentions() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER flow_message_mention AFTER INSERT ON public.flow_events FOR EACH ROW EXECUTE FUNCTION flow_private.notify_message_mentions();

-- Tasks and their comments are part of the customer's history when linked to a
-- customer. Standalone discussions are shown to participants and in All Activity.
CREATE OR REPLACE FUNCTION flow_private.capture_team_communication() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE n jsonb=to_jsonb(NEW); v_org uuid; v_contact uuid; v_task uuid; v_title text;
 v_customer text='Team'; v_actor text='Team member'; v_mentions uuid[]='{}'::uuid[];
 v_summary text; v_source uuid; v_module text; v_private boolean=false;
BEGIN
 v_org=(n->>'organization_id')::uuid;
 IF v_org IS NULL THEN RETURN NEW; END IF;
 v_source=NEW.id;
 SELECT full_name INTO v_actor FROM public.profiles WHERE id=(n->>'user_id')::uuid AND organization_id=v_org;
 IF TG_TABLE_NAME='tasks' THEN
  v_contact=(n->>'contact_id')::uuid;
  IF v_contact IS NULL THEN RETURN NEW; END IF;
  v_module='tasks'; v_task=NEW.id; v_title=n->>'title';
  IF TG_OP='INSERT' THEN v_summary='Task created: '||left(v_title,90);
  ELSIF n->>'status' IS DISTINCT FROM to_jsonb(OLD)->>'status' THEN
   v_summary='Task '||replace(coalesce(n->>'status','updated'),'_',' ')||': '||left(v_title,90);
  ELSE RETURN NEW; END IF;
 ELSIF TG_TABLE_NAME='task_comments' THEN
  SELECT contact_id,title INTO v_contact,v_title FROM public.tasks WHERE id=(n->>'task_id')::uuid AND organization_id=v_org;
  IF v_contact IS NULL THEN RETURN NEW; END IF;
  v_task=(n->>'task_id')::uuid; v_module='tasks'; v_summary='Comment on task: '||left(v_title,85);
 ELSIF TG_TABLE_NAME='discussion_posts' THEN
  v_module='feed'; v_private=coalesce((n->>'is_private')::boolean,false);
  IF n->>'parent_id' IS NOT NULL THEN v_summary='Reply in a discussion';
  ELSE v_summary=initcap(coalesce(n->>'post_type','discussion'))||' posted'; END IF;
 ELSE RETURN NEW; END IF;
 IF v_contact IS NOT NULL THEN
  SELECT coalesce(nullif(full_name,''),nullif(contact_name,''),nullif(company_name,''),'Customer')
  INTO v_customer FROM public.contacts WHERE id=v_contact AND organization_id=v_org;
 END IF;
 -- Discussion posts store user IDs in mentions; task comments use @handles.
 IF TG_TABLE_NAME='discussion_posts' THEN
  SELECT coalesce(array_agg(DISTINCT p.id),'{}'::uuid[]) INTO v_mentions FROM public.profiles p
  WHERE p.organization_id=v_org AND p.id::text=ANY(NEW.mentions);
 END IF;
 SELECT coalesce(array_agg(DISTINCT mentioned.id),'{}'::uuid[]) INTO v_mentions FROM (
  SELECT p.id FROM regexp_matches(n->>'content','(^|[^[:alnum:]_])@([[:alnum:]_]+)','g') match
   JOIN public.profiles p ON lower(p.username)=lower(match[2]) AND p.organization_id=v_org
   WHERE p.id IS DISTINCT FROM (n->>'user_id')::uuid
  UNION SELECT unnest(v_mentions)
 ) mentioned;
 INSERT INTO public.flow_events(organization_id,contact_id,actor_id,actor_name,customer_name,
  category,event_type,summary,details,source_table,source_id,required_module,is_internal,mentioned_user_ids,created_at,task_id)
 VALUES(v_org,v_contact,(n->>'user_id')::uuid,coalesce(v_actor,'Team member'),coalesce(v_customer,'Team'),
  'communication',TG_TABLE_NAME||'.'||lower(TG_OP),v_summary,
  'Open the task or discussion to read the full conversation.',TG_TABLE_NAME,v_source,v_module,v_private,
  coalesce(v_mentions,'{}'::uuid[]),coalesce((n->>'created_at')::timestamptz,now()),v_task);
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION flow_private.capture_team_communication() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER capture_task_flow AFTER INSERT OR UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION flow_private.capture_team_communication();
CREATE TRIGGER capture_task_comment_flow AFTER INSERT ON public.task_comments FOR EACH ROW EXECUTE FUNCTION flow_private.capture_team_communication();
CREATE TRIGGER capture_discussion_flow AFTER INSERT ON public.discussion_posts FOR EACH ROW EXECUTE FUNCTION flow_private.capture_team_communication();

-- Access to an entire conversation does not mean every message needs action.
-- Mentioned messages remain in My Work even when another person owns the job.
CREATE OR REPLACE FUNCTION public.get_flow_events(p_filters jsonb DEFAULT '{}'::jsonb, p_before bigint DEFAULT NULL, p_limit integer DEFAULT 50)
RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
 SELECT to_jsonb(e)||jsonb_build_object('viewed',v.event_id IS NOT NULL,
  'preview',CASE e.source_table
   WHEN 'messages' THEN (SELECT left(m.body,140) FROM public.messages m WHERE m.id=e.source_id)
   WHEN 'discussion_posts' THEN (SELECT left(d.content,140) FROM public.discussion_posts d WHERE d.id=e.source_id)
   WHEN 'task_comments' THEN (SELECT left(tc.content,140) FROM public.task_comments tc WHERE tc.id=e.source_id)
   ELSE NULL END)
 FROM public.flow_events e LEFT JOIN public.flow_event_views v ON v.event_id=e.id AND v.user_id=(SELECT auth.uid())
 WHERE (p_before IS NULL OR e.id<p_before)
 AND (nullif(p_filters->>'contact_id','') IS NULL OR e.contact_id=(p_filters->>'contact_id')::uuid)
 AND (nullif(p_filters->>'project_id','') IS NULL OR e.project_id=(p_filters->>'project_id')::uuid)
 AND (nullif(p_filters->>'work_order_id','') IS NULL OR e.work_order_id=(p_filters->>'work_order_id')::uuid)
 AND (nullif(p_filters->>'location_id','') IS NULL OR e.customer_location_id=(p_filters->>'location_id')::uuid)
 AND (nullif(p_filters->>'office_id','') IS NULL OR e.office_id=(p_filters->>'office_id')::uuid)
 AND (nullif(p_filters->>'actor_id','') IS NULL OR e.actor_id=(p_filters->>'actor_id')::uuid)
 AND (nullif(p_filters->>'category','') IS NULL OR e.category=p_filters->>'category')
 AND (nullif(p_filters->>'kind','') IS NULL OR CASE p_filters->>'kind'
  WHEN 'messages' THEN e.source_table='messages'
  WHEN 'discussions' THEN e.source_table='discussion_posts'
  WHEN 'tasks' THEN e.source_table IN ('tasks','task_comments')
  WHEN 'updates' THEN e.category='update'
  WHEN 'activity' THEN e.source_table NOT IN ('messages','discussion_posts','tasks','task_comments') AND e.category<>'update'
  ELSE false END)
 AND (nullif(p_filters->>'since','') IS NULL OR e.created_at>=(p_filters->>'since')::timestamptz)
 AND (nullif(p_filters->>'until','') IS NULL OR e.created_at<(p_filters->>'until')::timestamptz)
 AND (NOT coalesce((p_filters->>'new_only')::boolean,false) OR v.event_id IS NULL)
 AND (nullif(trim(p_filters->>'search'),'') IS NULL OR
  position(lower(trim(p_filters->>'search')) IN lower(concat_ws(' ',e.customer_name,e.project_name,e.work_order_number,e.location_name,e.summary,e.actor_name)))>0)
 AND (NOT coalesce((p_filters->>'mentions_only')::boolean,false) OR (SELECT auth.uid())=ANY(e.mentioned_user_ids))
 AND (NOT coalesce((p_filters->>'my_work')::boolean,false) OR e.actor_id=(SELECT auth.uid())
  OR (SELECT auth.uid())=ANY(e.mentioned_user_ids)
  OR (e.source_table='discussion_posts' AND EXISTS (
    SELECT 1 FROM public.discussion_posts d WHERE d.id=e.source_id AND (SELECT auth.uid()) IN (d.user_id,d.assigned_to)))
  OR (e.source_table='messages' AND EXISTS (
   SELECT 1 FROM public.message_threads t WHERE t.id=e.thread_id AND t.organization_id=e.organization_id
    AND (t.created_by=(SELECT auth.uid()) OR t.assigned_sales_rep_id=(SELECT auth.uid())
     OR (t.context_type NOT IN ('project','work_order') AND EXISTS (SELECT 1 FROM public.contacts c WHERE c.id=t.contact_id AND c.assigned_to=(SELECT auth.uid())))
     OR EXISTS (SELECT 1 FROM public.projects p WHERE p.organization_id=t.organization_id
       AND (t.context_type='project' AND p.id=t.context_id OR t.context_type NOT IN ('project','work_order') AND p.contact_id=t.contact_id)
       AND (SELECT auth.uid()) IN (p.assigned_pm,p.salesperson_id,p.designer_id))
     OR EXISTS (SELECT 1 FROM public.work_orders w WHERE w.organization_id=t.organization_id
       AND (t.context_type='work_order' AND w.id=t.context_id OR t.context_type NOT IN ('project','work_order') AND w.contact_id=t.contact_id)
       AND (SELECT auth.uid()) IN (w.assigned_to,w.customer_sales_rep_id))
     OR EXISTS (SELECT 1 FROM public.profiles me WHERE me.id=(SELECT auth.uid())
       AND me.role='service_manager' AND t.context_type IN ('work_order','service_request')))))
  OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id=e.project_id AND p.organization_id=e.organization_id AND (SELECT auth.uid()) IN (p.assigned_pm,p.salesperson_id,p.designer_id))
  OR EXISTS (SELECT 1 FROM public.work_orders w WHERE w.organization_id=e.organization_id AND (w.id=e.work_order_id OR (e.project_id IS NOT NULL AND w.project_id=e.project_id)) AND (SELECT auth.uid()) IN (w.assigned_to,w.customer_sales_rep_id))
  OR (e.project_id IS NULL AND e.work_order_id IS NULL AND EXISTS (SELECT 1 FROM public.contacts c WHERE c.id=e.contact_id AND c.organization_id=e.organization_id AND c.assigned_to=(SELECT auth.uid())))
 )
 ORDER BY e.id DESC LIMIT least(greatest(p_limit,1),100);
$$;
