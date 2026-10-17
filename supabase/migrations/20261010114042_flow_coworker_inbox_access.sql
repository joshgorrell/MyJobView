-- Authorize replies against their original conversation. The lookup must bypass
-- discussion_posts RLS to avoid recursively invoking its own SELECT policy.
-- Authorization is still explicit: authenticated employee, own company, module
-- access, and the original conversation's audience. No client-provided identity.
create or replace function public.flow_can_view_discussion(p_post_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
 with recursive ancestry as (
   select d.*, 0 as depth from public.discussion_posts d
   where d.id=p_post_id and d.organization_id=public.get_user_org_id()
   union all
   select parent.*, child.depth+1 from public.discussion_posts parent
   join ancestry child on parent.id=child.parent_id and parent.organization_id=child.organization_id
   where child.depth<32
 )
 select (select auth.uid()) is not null
   and public.flow_has_module_access('feed')
   and exists (
     select 1 from ancestry d
     where d.parent_id is null and (
       (d.audience_type is null and (
         not coalesce(d.is_private,false) or (select auth.uid())=d.user_id
         or (select auth.uid())=d.assigned_to or ((select auth.uid())::text=any(d.mentions))
       ))
       or d.audience_type='company'
       or (d.audience_type='direct' and (
         (select auth.uid())=d.user_id or (select auth.uid())=any(d.audience_user_ids)
       ))
       or (d.audience_type='department' and (
         (select auth.uid())=d.user_id or not exists (
           select 1 from public.department_access da
           where da.organization_id=d.organization_id and da.department_id=d.audience_department_id
             and da.user_id=(select auth.uid()) and da.has_access=false
         )
       ))
     )
   );
$$;
revoke all on function public.flow_can_view_discussion(uuid) from public, anon;
grant execute on function public.flow_can_view_discussion(uuid) to authenticated;

CREATE OR REPLACE FUNCTION flow_private.validate_discussion_audience()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_parent public.discussion_posts%rowtype;
begin
  if (select auth.uid()) is null or new.user_id is distinct from (select auth.uid())
     or new.organization_id is distinct from public.get_user_org_id()
     or not public.flow_has_module_access('feed') then
    raise exception 'A permitted employee account is required';
  end if;
  if new.parent_id is not null and not public.flow_can_view_discussion(new.parent_id) then
    raise exception 'Parent discussion is not accessible';
  end if;
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
$function$;

revoke all on function flow_private.validate_discussion_audience() from public, anon, authenticated;
