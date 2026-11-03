-- Smart Intake foundation: email-first, SMS optional.
-- This migration creates storage only. Do not route live webhooks until the
-- provider signature, tenant mapping, and review UI have passed integration tests.

create table if not exists public.intake_destinations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  office_id uuid references public.company_offices(id),
  channel text not null check (channel in ('email', 'sms', 'mms')),
  destination_address text not null,
  provider text not null,
  enabled boolean not null default false,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint intake_destination_unique unique (channel, destination_address),
  constraint intake_destination_activation check (not enabled or verified_at is not null)
);

create table if not exists public.intake_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  office_id uuid references public.company_offices(id),
  channel text not null check (channel in ('email', 'sms', 'mms')),
  provider text not null,
  provider_event_id text not null,
  source_address text not null,
  destination_address text not null,
  subject text,
  raw_body text,
  status text not null default 'received' check (status in
    ('received','analyzing','awaiting_customer','awaiting_employee',
     'needs_review','ready','processed','duplicate_linked','dismissed','failed_retryable')),
  classification text not null default 'unknown' check (classification in ('unknown','service','task','sales','other')),
  priority text not null default 'normal',
  contact_id uuid references public.contacts(id),
  lead_id uuid references public.leads(id),
  service_request_id uuid references public.service_requests(id),
  missing_fields jsonb not null default '[]'::jsonb,
  dismissal_reason text,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint intake_item_provider_unique unique (organization_id, channel, provider, provider_event_id)
);
create index if not exists intake_items_open_queue on public.intake_items
  (organization_id, status, last_activity_at desc);

create table if not exists public.intake_messages (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid not null references public.intake_items(id) on delete cascade,
  provider_message_id text,
  direction text not null check (direction in ('inbound','outbound')),
  sender_address text,
  body text,
  created_at timestamptz not null default now(),
  constraint intake_message_unique unique (intake_id, provider_message_id)
);

create table if not exists public.intake_attachments (
  id uuid primary key default gen_random_uuid(),
  intake_message_id uuid not null references public.intake_messages(id) on delete cascade,
  storage_key text not null,
  original_filename text,
  mime_type text,
  byte_size bigint check (byte_size >= 0),
  scan_status text not null default 'pending' check (scan_status in ('pending','clean','blocked','failed')),
  created_at timestamptz not null default now(),
  disposition text not null default 'pending'
    check (disposition in ('pending','discarded','customer_media','work_order','both')),
  expires_at timestamptz not null default (now() + interval '30 days'),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id),
  deleted_at timestamptz,
  sha256 text,
  scan_completed_at timestamptz,
  constraint intake_attachment_resolution_check check (
    (disposition = 'pending' and resolved_at is null)
    or (disposition <> 'pending' and resolved_at is not null)
  )
);

-- Tenant scope is derived from the parent intake message, not caller input.
create index if not exists intake_attachments_message
  on public.intake_attachments(intake_message_id);

create index if not exists intake_attachments_expiring
  on public.intake_attachments(expires_at)
  where disposition = 'pending' and deleted_at is null;

-- One physical media object may be referenced by multiple work orders.
-- Linking is service-role-only until tenant-scoped mutation RPCs are reviewed.
create table if not exists public.intake_attachment_work_order_links (
  attachment_id uuid not null references public.intake_attachments(id) on delete restrict,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  primary key (attachment_id, work_order_id)
);
alter table public.intake_attachment_work_order_links enable row level security;

create table if not exists public.intake_events (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid not null references public.intake_items(id) on delete cascade,
  actor_type text not null check (actor_type in ('system','ai','employee','provider')),
  actor_id uuid,
  event_type text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Private by default. Authorized server-side ingestion uses service role;
-- staff policies are added only after checking existing permission helpers.
alter table public.intake_destinations enable row level security;
alter table public.intake_items enable row level security;
alter table public.intake_messages enable row level security;
alter table public.intake_attachments enable row level security;
alter table public.intake_events enable row level security;

-- Prevent concurrent webhook retries from creating duplicate receipt evidence.
-- Other event types intentionally remain repeatable for a full audit timeline.
create unique index if not exists intake_events_one_email_received
  on public.intake_events (intake_id)
  where event_type = 'email_received';

-- Only one unresolved attachment quarantine warning per intake. A later
-- attachment event may be recorded after resolution using a distinct type.
create unique index if not exists intake_events_one_attachments_pending
  on public.intake_events (intake_id)
  where event_type = 'attachments_pending';

-- One attachment object key per inbound message; retries must not create
-- duplicate rows for the same quarantined provider attachment.
create unique index if not exists intake_attachments_message_storage_unique
  on public.intake_attachments (intake_message_id, storage_key);
