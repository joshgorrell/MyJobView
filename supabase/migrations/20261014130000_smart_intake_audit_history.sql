-- Append-only audit evidence and processing attempts for Smart Intake.
-- This migration is staged, not applied to production.
create table if not exists public.intake_delivery_events (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid not null references public.intake_items(id) on delete restrict,
  provider text not null,
  provider_event_id text,
  event_kind text not null,
  delivery_status text,
  detail jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  recorded_at timestamptz not null default now(),
  unique (intake_id, provider, provider_event_id, event_kind)
);
create index if not exists intake_delivery_events_timeline
  on public.intake_delivery_events (intake_id, occurred_at desc);

create table if not exists public.intake_processing_attempts (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid not null references public.intake_items(id) on delete restrict,
  attempt_number integer not null check (attempt_number > 0),
  outcome text not null check (outcome in ('started','succeeded','failed','skipped')),
  reason_code text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (intake_id, attempt_number, outcome)
);
create index if not exists intake_processing_attempts_timeline
  on public.intake_processing_attempts (intake_id, created_at desc);

alter table public.intake_delivery_events enable row level security;
alter table public.intake_processing_attempts enable row level security;
-- Service role only until authorized staff RLS policies are reviewed.
-- Append-only permissions will be enforced with narrowly scoped DB grants/policies.
