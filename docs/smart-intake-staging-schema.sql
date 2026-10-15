-- Smart Intake staging schema. REVIEW BEFORE APPLYING; no production changes.
-- Service-role ingestion only until scoped employee RLS policies are verified.
create table if not exists public.intake_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  office_id uuid null,
  channel text not null check (channel in ('email','sms','mms')),
  provider text not null,
  provider_event_id text not null,
  source_address text not null,
  destination_address text not null,
  subject text,
  raw_body text,
  status text not null default 'received' check (status in ('received','analyzing','awaiting_customer','awaiting_employee','needs_review','ready','processed','duplicate_linked','dismissed','failed_retryable')),
  classification text not null default 'unknown' check (classification in ('unknown','service','sales','other')),
  priority text not null default 'normal',
  contact_id uuid null references public.contacts(id),
  lead_id uuid null references public.leads(id),
  service_request_id uuid null references public.service_requests(id),
  missing_fields jsonb not null default '[]'::jsonb,
  assigned_to uuid null,
  dismissal_reason text,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, channel, provider, provider_event_id)
);
create index if not exists intake_items_queue_idx on public.intake_items (organization_id, status, last_activity_at desc);

create table if not exists public.intake_messages (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid not null references public.intake_items(id) on delete cascade,
  provider_message_id text,
  direction text not null check (direction in ('inbound','outbound')),
  sender_address text,
  body text,
  created_at timestamptz not null default now(),
  unique (intake_id, provider_message_id)
);

create table if not exists public.intake_attachments (
  id uuid primary key default gen_random_uuid(),
  intake_message_id uuid not null references public.intake_messages(id) on delete cascade,
  storage_key text not null,
  original_filename text,
  mime_type text,
  byte_size bigint check (byte_size >= 0),
  scan_status text not null default 'pending' check (scan_status in ('pending','clean','blocked','failed')),
  created_at timestamptz not null default now()
);

create table if not exists public.intake_events (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid not null references public.intake_items(id) on delete cascade,
  actor_type text not null check (actor_type in ('system','ai','employee','provider')),
  actor_id uuid,
  event_type text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.intake_destinations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  office_id uuid,
  channel text not null check (channel in ('email','sms','mms')),
  destination_address text not null,
  provider text not null,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  unique (channel, destination_address)
);

alter table public.intake_items enable row level security;
alter table public.intake_messages enable row level security;
alter table public.intake_attachments enable row level security;
alter table public.intake_events enable row level security;
alter table public.intake_destinations enable row level security;

-- Deliberately no anon/authenticated policies yet: deny by default.
-- Before rollout, add verified employee-scoped SELECT/UPDATE policies and
-- explicit service-role webhook ingestion with provider authentication.
