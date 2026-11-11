-- Phone Dispatcher #686: private-by-default voicemail records.
-- Only trusted server workers may insert or change voicemail records.
-- User-facing access will be added separately with department-aware policies.
create table if not exists public.voicemail_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  ringcentral_account_id text not null,
  ringcentral_extension_id text not null,
  ringcentral_message_id text not null,
  state text not null default 'received'
    check (state in ('received','processing','ready','review','quarantined','failed')),
  caller_number text,
  contact_id uuid references public.contacts(id) on delete set null,
  transcript text,
  summary text,
  department text check (department is null or department in
    ('sales','service','projects','security','accounting','administration')),
  department_confidence double precision check
    (department_confidence is null or department_confidence between 0 and 1),
  spam_confidence double precision check
    (spam_confidence is null or spam_confidence between 0 and 1),
  urgent boolean not null default false,
  callback_requested boolean not null default false,
  recording_path text,
  quarantine_expires_at timestamptz,
  last_error text,
  received_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint voicemail_messages_scoped_dedupe unique
    (organization_id, ringcentral_account_id, ringcentral_extension_id, ringcentral_message_id),
  constraint voicemail_messages_quarantine_expiry check
    (state <> 'quarantined' or quarantine_expires_at is not null)
);
create index if not exists voicemail_messages_org_received_idx
  on public.voicemail_messages (organization_id, received_at desc);
create index if not exists voicemail_messages_quarantine_idx
  on public.voicemail_messages (quarantine_expires_at)
  where state = 'quarantined';

alter table public.voicemail_messages enable row level security;
-- Intentionally no anon/authenticated policies. This table contains customer
-- audio metadata and transcripts. Backend service role only until Flow access
-- permissions and private recording download authorization are implemented.
revoke all on public.voicemail_messages from anon, authenticated;
grant all on public.voicemail_messages to service_role;

comment on table public.voicemail_messages is
  'RingCentral voicemail processing records. Server-only until department-scoped Flow access is implemented.';
