-- Slack-style internal audiences for Flow.
alter table public.discussion_posts
  add column if not exists audience_type text,
  add column if not exists audience_department_id uuid references public.departments(id) on delete set null,
  add column if not exists audience_user_ids uuid[] not null default '{}'::uuid[];

alter table public.discussion_posts drop constraint if exists discussion_posts_audience_type_check;
alter table public.discussion_posts add constraint discussion_posts_audience_type_check
  check (audience_type is null or audience_type in ('direct','department','company'));
create index if not exists discussion_posts_audience_department_idx on public.discussion_posts(audience_department_id) where audience_department_id is not null;
create index if not exists discussion_posts_audience_users_gin on public.discussion_posts using gin(audience_user_ids);

CREATE OR REPLACE FUNCTION public.flow_can_view_discussion(p_post_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.discussion_posts d
    where d.id = p_post_id
      and d.organization_id = public.get_user_org_id()
      and (
        -- Historical rows keep their existing privacy behavior.
        (d.audience_type is null and (
          not coalesce(d.is_private,false)
          or (select auth.uid()) = d.user_id
          or (select auth.uid()) = d.assigned_to
          or ((select auth.uid())::text = any(d.mentions))
        ))
        or d.audience_type = 'company'
        or (d.audience_type = 'direct' and (
          (select auth.uid()) = d.user_id
          or (select auth.uid()) = any(d.audience_user_ids)
        ))
        or (d.audience_type = 'department' and (
          (select auth.uid()) = d.user_id
          or exists (
            select 1 from public.department_access da
            where da.organization_id = d.organization_id
              and da.department_id = d.audience_department_id
              and da.user_id = (select auth.uid())
              and da.has_access = true
          )
        ))
      )
  );
$function$

grant execute on function public.flow_can_view_discussion(uuid) to authenticated;

drop policy if exists discussion_posts_select_same_org on public.discussion_posts;
drop policy if exists discussion_posts_select_audience on public.discussion_posts;
create policy discussion_posts_select_audience on public.discussion_posts for select to authenticated
using (public.flow_can_view_discussion(id));

drop policy if exists flow_events_read on public.flow_events;
create policy flow_events_read on public.flow_events for select to authenticated
using (
 organization_id=(select public.get_user_org_id()) and
 case
  when source_table='messages' then thread_id is not null and public.flow_can_view_thread(thread_id)
  when source_table='discussion_posts' then public.flow_has_module_access('feed') and public.flow_can_view_discussion(source_id)
  else public.flow_has_module_access(required_module) and
    (not is_internal or exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role=any(array['admin','manager','service_manager','production_manager'])))
 end
);

CREATE OR REPLACE FUNCTION flow_private.validate_discussion_audience()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_parent public.discussion_posts%rowtype;
begin
  if new.parent_id is not null then
    select * into v_parent
    from public.discussion_posts
    where id = new.parent_id and organization_id = new.organization_id;
    if found then
      new.audience_type := v_parent.audience_type;
      new.audience_department_id := v_parent.audience_department_id;
      new.audience_user_ids := v_parent.audience_user_ids;
      new.is_private := v_parent.is_private;
    end if;
  end if;

  if new.audience_type is null then return new; end if;

  if new.audience_type = 'direct' then
    new.is_private := true;
    new.audience_department_id := null;
    if coalesce(array_length(new.audience_user_ids,1),0) = 0 then
      raise exception 'Direct messages require at least one recipient';
    end if;
    if exists (
      select 1 from unnest(new.audience_user_ids) uid
      left join public.profiles p on p.id=uid and p.organization_id=new.organization_id and p.is_active=true
      where p.id is null
    ) then raise exception 'Direct message recipients must be active users in this company'; end if;
  elsif new.audience_type = 'department' then
    new.is_private := true;
    new.audience_user_ids := '{}'::uuid[];
    if new.audience_department_id is null or not exists (
      select 1 from public.departments d
      where d.id=new.audience_department_id and d.organization_id=new.organization_id and d.is_active=true
    ) then raise exception 'Department messages require an active department in this company'; end if;
  else
    new.is_private := false;
    new.audience_department_id := null;
    new.audience_user_ids := '{}'::uuid[];
  end if;
  return new;
end;
$function$

drop trigger if exists validate_discussion_audience on public.discussion_posts;
create trigger validate_discussion_audience before insert or update of parent_id,audience_type,audience_department_id,audience_user_ids
on public.discussion_posts for each row execute function flow_private.validate_discussion_audience();

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
 and (not coalesce((p_filters->>'my_work')::boolean,false) or e.actor_id=(select auth.uid())
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
$function$

