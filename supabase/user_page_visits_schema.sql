-- Navigation-only analytics: no URLs, query strings or interaction contents.
create table if not exists public.user_page_visits (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 user_id uuid not null references public.profiles(id),
 page_key text not null check (length(page_key) between 1 and 100 and page_key ~ '^[a-z0-9][a-z0-9_/-]*$'),
 visited_at timestamptz not null default now()
);
create index if not exists user_page_visits_org_date_idx on public.user_page_visits(organization_id, visited_at desc);
create index if not exists user_page_visits_org_page_date_idx on public.user_page_visits(organization_id, page_key, visited_at desc);
alter table public.user_page_visits enable row level security;
revoke all on public.user_page_visits from anon;
grant select, insert on public.user_page_visits to authenticated;
create policy "Record own page navigation" on public.user_page_visits for insert to authenticated
with check (user_id = (select auth.uid()) and exists (
 select 1 from public.profiles p where p.id = (select auth.uid()) and p.organization_id = user_page_visits.organization_id and p.is_active is true
));
create policy "Dealer admins can view page navigation" on public.user_page_visits for select to authenticated
using (exists (
 select 1 from public.profiles p where p.id = (select auth.uid()) and p.organization_id = user_page_visits.organization_id and p.role in ('admin','superadmin') and p.is_active is true
));