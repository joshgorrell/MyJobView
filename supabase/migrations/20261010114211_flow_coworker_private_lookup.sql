-- Authorize replies against their original conversation. The lookup must bypass
-- discussion_posts RLS to avoid recursively invoking its own SELECT policy.
-- Authorization is still explicit: authenticated employee, own company, module
-- access, and the original conversation's audience. No client-provided identity.
create or replace function flow_private.can_view_discussion(p_post_id uuid)
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
revoke all on function flow_private.can_view_discussion(uuid) from public, anon;
grant execute on function flow_private.can_view_discussion(uuid) to authenticated;

-- A parsed SQL body binds the private helper at creation time. The authenticated
-- role can execute this one helper through the RLS wrapper without gaining USAGE
-- on flow_private or access to any other internal functions in that schema.
create or replace function public.flow_can_view_discussion(p_post_id uuid)
returns boolean language sql stable security invoker set search_path=''
return flow_private.can_view_discussion(p_post_id);
revoke all on function public.flow_can_view_discussion(uuid) from public, anon;
grant execute on function public.flow_can_view_discussion(uuid) to authenticated;
