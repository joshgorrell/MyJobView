-- Opt-in notifications per authorized user and dealer.
create table if not exists public.intake_notification_preferences (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  new_service_request boolean not null default false,
  urgent_service_request boolean not null default false,
  needs_review boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
alter table public.intake_notification_preferences enable row level security;
-- No direct policies until the established MJV membership authorization helper is confirmed.
-- Service role writes require verified org membership and service-center access.
