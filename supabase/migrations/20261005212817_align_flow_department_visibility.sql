-- Match DepartmentContext semantics: department access is allowed by default unless explicitly denied.
create or replace function public.flow_can_view_discussion(p_post_id uuid)
returns boolean language sql stable security invoker set search_path=''
as $$
 select exists (
  select 1 from public.discussion_posts d
  where d.id=p_post_id and d.organization_id=public.get_user_org_id()
   and (
    (d.audience_type is null and (not coalesce(d.is_private,false) or (select auth.uid())=d.user_id or (select auth.uid())=d.assigned_to or ((select auth.uid())::text=any(d.mentions))))
    or d.audience_type='company'
    or (d.audience_type='direct' and ((select auth.uid())=d.user_id or (select auth.uid())=any(d.audience_user_ids)))
    or (d.audience_type='department' and (
      (select auth.uid())=d.user_id
      or not exists (
        select 1 from public.department_access da
        where da.organization_id=d.organization_id and da.department_id=d.audience_department_id
          and da.user_id=(select auth.uid()) and da.has_access=false
      )
    ))
   )
 );
$$;
grant execute on function public.flow_can_view_discussion(uuid) to authenticated;
