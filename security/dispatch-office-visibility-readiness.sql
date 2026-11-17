-- READ-ONLY readiness audit for Dispatch Office Visibility.
-- Run before any GPS RLS migration. No user records are modified.
select 'active_profiles' metric, count(*)::bigint value
from public.profiles where is_active = true
union all
select 'active_profiles_without_user_offices', count(*)::bigint
from public.profiles p
where p.is_active = true and not exists (
  select 1 from public.user_offices u
  where u.user_id = p.id and u.organization_id = p.organization_id
)
union all
select 'active_profiles_without_primary_office', count(*)::bigint
from public.profiles where is_active = true and primary_office_id is null
union all
select 'active_profiles_without_visibility_setting', count(*)::bigint
from public.profiles p where p.is_active = true and not exists (
  select 1 from public.user_visibility_settings v
  where v.user_id = p.id and v.organization_id = p.organization_id
)
union all
select 'selected_offices_without_allowed_office', count(*)::bigint
from public.user_visibility_settings v
where v.visibility_scope = 'selected_offices' and not exists (
  select 1 from public.user_visible_offices o
  where o.user_id = v.user_id and o.organization_id = v.organization_id
);

-- Orphan or cross-organization office memberships.
select u.user_id, u.office_id, u.organization_id,
  case when p.id is null then 'missing employee'
       when o.id is null then 'missing office'
       when p.organization_id <> u.organization_id or o.organization_id <> u.organization_id then 'organization mismatch'
       else 'ok' end as validation
from public.user_offices u
left join public.profiles p on p.id = u.user_id
left join public.company_offices o on o.id = u.office_id
where p.id is null or o.id is null
   or p.organization_id <> u.organization_id
   or o.organization_id <> u.organization_id;

-- Compare the proposed office-only interpretation against existing Tech Stats:
-- get_tech_production uses viewer.primary_office_id; proposed GPS helper
-- uses membership intersections. These MUST be reconciled before deployment.
select count(*) as active_office_only_viewers_without_primary_office
from public.user_visibility_settings v
join public.profiles p on p.id = v.user_id
where p.is_active = true and v.visibility_scope = 'office_only'
  and p.primary_office_id is null;
