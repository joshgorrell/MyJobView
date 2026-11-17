-- REVIEW-ONLY security proposal. Do not run against production before role and fallback sign-off.
-- Existing Tech Stats semantics: missing visibility row => all_offices; admin => all.
-- Restricts GPS reads without affecting technicians' existing GPS INSERT policies.
begin;

create or replace function public.can_view_dispatch_technician(p_technician uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles viewer
    join public.profiles employee
      on employee.id = p_technician
     and employee.organization_id = viewer.organization_id
    left join public.user_visibility_settings visibility
      on visibility.user_id = viewer.id
     and visibility.organization_id = viewer.organization_id
    where viewer.id = (select auth.uid())
      and viewer.is_active = true
      and (
        employee.id = viewer.id
        or viewer.role = 'admin'
        or coalesce(visibility.visibility_scope, 'all_offices') = 'all_offices'
        or (
          visibility.visibility_scope = 'office_only'
          and exists (
            select 1 from public.user_offices own_office
            join public.user_offices employee_office
              on employee_office.office_id = own_office.office_id
             and employee_office.organization_id = viewer.organization_id
            where own_office.user_id = viewer.id
              and own_office.organization_id = viewer.organization_id
              and employee_office.user_id = employee.id
          )
        )
        or (
          visibility.visibility_scope = 'selected_offices'
          and exists (
            select 1 from public.user_visible_offices allowed
            join public.user_offices employee_office
              on employee_office.office_id = allowed.office_id
             and employee_office.organization_id = viewer.organization_id
            where allowed.user_id = viewer.id
              and allowed.organization_id = viewer.organization_id
              and employee_office.user_id = employee.id
          )
        )
      )
  );
$$;

revoke all on function public.can_view_dispatch_technician(uuid) from public, anon;
grant execute on function public.can_view_dispatch_technician(uuid) to authenticated;

-- Existing SELECT policies are permissive; DROP the organization-only policy
-- before creating its replacement or it will OR-bypass the office restriction.
drop policy if exists gps_breadcrumbs_select_same_org on public.gps_breadcrumbs;
create policy gps_breadcrumbs_select_visible_technician
  on public.gps_breadcrumbs for select to authenticated
  using (
    organization_id = (select public.get_user_org_id())
    and (select public.can_view_dispatch_technician(technician_id))
  );

drop policy if exists enhanced_gps_breadcrumbs_select_same_org on public.enhanced_gps_breadcrumbs;
create policy enhanced_gps_breadcrumbs_select_visible_technician
  on public.enhanced_gps_breadcrumbs for select to authenticated
  using (
    organization_id = (select public.get_user_org_id())
    and (select public.can_view_dispatch_technician(technician_id))
  );

create or replace function public.get_visible_dispatch_technicians()
returns table(id uuid, full_name text)
language sql stable security invoker
set search_path = ''
as $$
  select p.id, p.full_name
  from public.profiles p
  where p.organization_id = (select public.get_user_org_id())
    and p.is_active = true
    and public.can_view_dispatch_technician(p.id)
  order by p.full_name;
$$;

revoke all on function public.get_visible_dispatch_technicians() from public, anon;
grant execute on function public.get_visible_dispatch_technicians() to authenticated;

commit;
