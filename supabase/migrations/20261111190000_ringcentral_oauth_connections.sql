-- RingCentral OAuth connections are server-only and organization-scoped.
-- Tokens are encrypted by Edge Functions before insertion; never store plaintext.
create table if not exists public.ringcentral_oauth_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  ringcentral_account_id text not null,
  encrypted_access_token text not null,
  encrypted_refresh_token text not null,
  access_expires_at timestamptz not null,
  refresh_expires_at timestamptz,
  token_version bigint not null default 1,
  status text not null default 'connected' check (status in ('connected','reauthorization_required','disconnected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ringcentral_account_id),
  check (length(trim(ringcentral_account_id)) > 0),
  check (token_version > 0)
);
create index if not exists ringcentral_oauth_connections_org_idx
  on public.ringcentral_oauth_connections (organization_id);
alter table public.ringcentral_oauth_connections enable row level security;
revoke all on public.ringcentral_oauth_connections from anon, authenticated;
grant select, insert, update, delete on public.ringcentral_oauth_connections to service_role;
comment on table public.ringcentral_oauth_connections is
  'Private per-account RingCentral OAuth credentials. Encrypted at application layer; never expose to authenticated users.';
