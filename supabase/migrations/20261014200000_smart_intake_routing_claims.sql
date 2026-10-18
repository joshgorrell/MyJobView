-- Routing claim is a durable, single-writer handoff, NOT a processed status.
-- No destination records are created until a separately tested processor exists.
create table if not exists public.intake_routing_claims (
  intake_id uuid primary key references public.intake_items(id) on delete cascade,
  organization_id uuid not null references public.organizations(id),
  state text not null default 'pending' check (state in ('pending','processing','completed','failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  claimed_at timestamptz,
  completed_at timestamptz,
  destination_kind text,
  destination_id uuid,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists intake_routing_claims_queue
  on public.intake_routing_claims (state, created_at)
  where state in ('pending','failed');
alter table public.intake_routing_claims enable row level security;
-- Staff can see the queue through existing Smart Intake page authorization,
-- but cannot claim, complete, or forge a routed record.
create policy intake_routing_claims_staff_read on public.intake_routing_claims
  for select to authenticated
  using (public.smart_intake_staff_can_read(organization_id));
grant select on public.intake_routing_claims to authenticated;

-- Called by a trusted ingestion/processor service after evidence is persisted,
-- scanned as required, and a verified customer association exists.
-- A claim is inserted at most once, so webhook retries cannot enqueue duplicates.
create or replace function public.smart_intake_enqueue_ready(target_intake uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  current_item public.intake_items%rowtype;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'Trusted processor required';
  end if;
  select * into current_item from public.intake_items
    where id = target_intake for update;
  if not found then raise exception 'Intake not found'; end if;
  if current_item.contact_id is null
    or current_item.classification <> 'service'
    or current_item.status <> 'ready'
    or current_item.missing_fields is distinct from '[]'::jsonb then
    return false;
  end if;
  if exists (
    select 1 from public.intake_attachments a
    join public.intake_messages m on m.id = a.intake_message_id
    where m.intake_id = target_intake
      and (a.scan_status <> 'clean' or a.disposition = 'pending')
  ) then
    return false;
  end if;
  -- Never enqueue a receipt that has no safely persisted message content.
  if not exists (
    select 1 from public.intake_messages m
    where m.intake_id = target_intake
      and m.direction = 'inbound'
      and nullif(btrim(m.body), '') is not null
  ) and nullif(btrim(current_item.raw_body), '') is null then
    return false;
  end if;
  insert into public.intake_routing_claims (intake_id, organization_id)
    values (target_intake, current_item.organization_id)
    on conflict (intake_id) do nothing;
  return true;
end;
$$;
revoke all on function public.smart_intake_enqueue_ready(uuid) from public, anon, authenticated;
grant execute on function public.smart_intake_enqueue_ready(uuid) to service_role;
