-- Short-lived, single-use OAuth state. No bearer credentials or authorization
-- codes are stored. Only a SHA-256 digest of the random state is persisted.
create table if not exists public.ringcentral_oauth_states (
  state_hash text primary key check (state_hash ~ '^[a-f0-9]{64}$'),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  initiated_by uuid not null references auth.users(id) on delete cascade,
  redirect_uri text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  consumed_at timestamptz,
  check (expires_at > created_at)
);
create index if not exists ringcentral_oauth_states_expiry_idx
  on public.ringcentral_oauth_states (expires_at);
alter table public.ringcentral_oauth_states enable row level security;
revoke all on public.ringcentral_oauth_states from anon, authenticated;
grant select, insert, update, delete on public.ringcentral_oauth_states to service_role;

-- The service-role PostgREST conditional UPDATE...RETURNING consumes state atomically.
