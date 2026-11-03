-- Separate branded email destinations for support/tasks and sales leads.
alter table public.intake_destinations
  add column if not exists purpose text not null default 'support'
  check (purpose in ('support','sales'));
create index if not exists intake_destinations_enabled_purpose_idx
  on public.intake_destinations (organization_id, purpose, enabled)
  where channel = 'email';
-- Existing destinations default to support; sales requires an explicitly verified destination.
