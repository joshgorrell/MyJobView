-- Tenant-private employee directory. Business cards remain the source of contact data.
create table if not exists public.company_directory_settings (
  organization_id uuid primary key,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.company_directory_settings enable row level security;
revoke all on public.company_directory_settings from anon, authenticated;
create or replace function public.get_company_directory()
returns table (user_id uuid, full_name text, title text, email text, phone text, photo_url text, slug text, office_name text, banner_url text)
language sql stable security definer set search_path = public
as $$
  select p.id, coalesce(nullif(b.full_name,''),p.full_name)::text,
    coalesce(b.title,'')::text, coalesce(b.email,'')::text,
    coalesce(b.phone,'')::text, coalesce(b.photo_url,p.avatar_url)::text,
    b.slug::text, o.office_name::text, coalesce(b.banner_url, cs.business_card_banner_url)::text
  from public.profiles p
  join public.company_directory_settings s on s.organization_id=p.organization_id and s.enabled
  join public.profiles viewer on viewer.id=auth.uid() and viewer.is_active and viewer.organization_id=p.organization_id
  left join public.business_cards b on b.user_id=p.id and b.is_active
  left join public.company_offices o on o.id=p.primary_office_id\n  left join public.company_settings cs on cs.organization_id=p.organization_id
  where p.is_active
  order by p.full_name;
$$;
revoke all on function public.get_company_directory() from public, anon;
grant execute on function public.get_company_directory() to authenticated;
create or replace function public.set_company_directory_enabled(p_enabled boolean)
returns void language plpgsql security definer set search_path=public as $$
declare org uuid;
begin
  select organization_id into org from public.profiles
  where id=auth.uid() and is_active and role='admin';
  if org is null then raise exception 'Not authorized'; end if;
  insert into public.company_directory_settings(organization_id,enabled)
  values(org,p_enabled)
  on conflict (organization_id) do update set enabled=excluded.enabled,updated_at=now();
end $$;
revoke all on function public.set_company_directory_enabled(boolean) from public,anon;
grant execute on function public.set_company_directory_enabled(boolean) to authenticated;

create or replace function public.company_directory_enabled()
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.profiles p join public.company_directory_settings s
 on s.organization_id=p.organization_id where p.id=auth.uid() and p.is_active and s.enabled);
$$;
revoke all on function public.company_directory_enabled() from public,anon;
grant execute on function public.company_directory_enabled() to authenticated;
