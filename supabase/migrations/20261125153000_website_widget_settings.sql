-- Independent website widget configuration. No anonymous table access.
create table public.website_widget_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('sales-lead','chat','service','feedback','portal','analytics')),
  public_id uuid not null unique default gen_random_uuid(),
  enabled boolean not null default false,
  allowed_origins text[] not null default '{}',
  branding jsonb not null default '{}'::jsonb check (jsonb_typeof(branding) = 'object'),
  options jsonb not null default '{}'::jsonb check (jsonb_typeof(options) = 'object'),
  created_at timestamptz not null default now(),
  unique (organization_id, kind),
  check (not enabled or cardinality(allowed_origins) > 0)
);
alter table public.website_widget_settings enable row level security;
revoke all on public.website_widget_settings from public, anon, authenticated;
grant select, insert, update, delete on public.website_widget_settings to authenticated;
grant select, insert, update, delete on public.website_widget_settings to service_role;
create policy website_widget_admin on public.website_widget_settings
for all to authenticated
using (
  organization_id = public.get_user_org_id()
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
)
with check (
  organization_id = public.get_user_org_id()
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);
