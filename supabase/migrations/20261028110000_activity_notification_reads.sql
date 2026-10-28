-- Per-user, per-activity read state. Apply only after activity sources are wired and tested.
create table if not exists public.activity_notification_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null,
  activity_type text not null check (activity_type in ('pipeline_lead','pipeline_fishbowl','test_tune','feedback','service_request','message')),
  activity_id uuid not null,
  seen_at timestamptz not null default now(),
  primary key (user_id, activity_type, activity_id)
);

create index if not exists activity_notification_reads_org_user_idx
  on public.activity_notification_reads (organization_id, user_id);

alter table public.activity_notification_reads enable row level security;

create policy "Read own activity receipts" on public.activity_notification_reads
  for select to authenticated using (user_id = (select auth.uid()));

create policy "Record own activity receipts" on public.activity_notification_reads
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and organization_id = (select organization_id from public.profiles where id = (select auth.uid()))
  );

grant select, insert on public.activity_notification_reads to authenticated;
