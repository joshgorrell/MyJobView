-- Registry of RingCentral mailboxes explicitly authorized for each MJV organization.
-- Never resolve tenants from an incoming webhook's arbitrary organization ID.
create table if not exists public.ringcentral_mailboxes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  ringcentral_account_id text not null,
  ringcentral_extension_id text not null,
  enabled boolean not null default false,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ringcentral_mailboxes_unique_account_extension
    unique (ringcentral_account_id, ringcentral_extension_id),
  constraint ringcentral_mailboxes_nonempty_ids check
    (length(trim(ringcentral_account_id)) > 0 and length(trim(ringcentral_extension_id)) > 0)
);
create index if not exists ringcentral_mailboxes_org_idx
  on public.ringcentral_mailboxes (organization_id);
alter table public.ringcentral_mailboxes enable row level security;
revoke all on public.ringcentral_mailboxes from anon, authenticated;
grant all on public.ringcentral_mailboxes to service_role;
comment on table public.ringcentral_mailboxes is
  'Trusted server-only RingCentral mailbox ownership registry. Disabled until explicitly authorized.';
