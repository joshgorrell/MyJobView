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

-- Atomic single-use consume, not a SELECT followed by UPDATE.
-- Keep privileged RPC outside exposed public schema.
create schema if not exists private;
create or replace function private.consume_ringcentral_oauth_state(
  p_hash text, p_now timestamptz default now()
) returns table (organization_id uuid, initiated_by uuid, redirect_uri text)
language sql security invoker set search_path = ''
as $$
  update public.ringcentral_oauth_states s
  set consumed_at = p_now
  where s.state_hash = p_hash
    and s.consumed_at is null
    and s.expires_at > p_now
  returning s.organization_id, s.initiated_by, s.redirect_uri;
$$;
revoke all on function private.consume_ringcentral_oauth_state(text,timestamptz) from public, anon, authenticated;
grant usage on schema private to service_role;
grant execute on function private.consume_ringcentral_oauth_state(text,timestamptz) to service_role;
