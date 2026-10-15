-- Structured, employee-verified service details. No guessing billing or job address.
create table if not exists public.intake_service_details (
  intake_id uuid primary key references public.intake_items(id) on delete cascade,
  organization_id uuid not null references public.organizations(id),
  job_location_address text not null check (length(btrim(job_location_address)) between 1 and 500),
  job_location_city text,
  job_location_state text,
  job_location_zip text,
  billable_type text not null check (length(btrim(billable_type)) between 1 and 80),
  billable_by text not null check (length(btrim(billable_by)) between 1 and 80),
  verified_by uuid not null references public.profiles(id),
  verified_at timestamptz not null default now()
);
alter table public.intake_service_details enable row level security;
create policy intake_service_details_staff_read on public.intake_service_details
  for select to authenticated
  using (public.smart_intake_staff_can_read(organization_id));
grant select on public.intake_service_details to authenticated;

create or replace function public.smart_intake_verify_service_details(
  target_intake uuid, location_address text, location_city text,
  location_state text, location_zip text, billing_type text, billing_by text
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  item public.intake_items%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  select * into item from public.intake_items where id = target_intake for update;
  if not found or not public.smart_intake_staff_can_read(item.organization_id) then
    raise exception 'Not authorized';
  end if;
  if item.classification <> 'service' or item.contact_id is null
    or item.status in ('processed','dismissed','duplicate_linked') then
    raise exception 'Intake is not awaiting service details';
  end if;
  if nullif(btrim(location_address),'') is null
    or length(location_address) > 500
    or nullif(btrim(billing_type),'') is null or length(billing_type) > 80
    or nullif(btrim(billing_by),'') is null or length(billing_by) > 80
    or length(coalesce(location_city,'')) > 120
    or length(coalesce(location_state,'')) > 80
    or length(coalesce(location_zip,'')) > 20 then
    raise exception 'Invalid service details';
  end if;
  if exists (select 1 from public.intake_routing_claims where intake_id = target_intake) then
    raise exception 'Intake routing already queued';
  end if;
  insert into public.intake_service_details (
    intake_id, organization_id, job_location_address, job_location_city,
    job_location_state, job_location_zip, billable_type, billable_by, verified_by
  ) values (
    target_intake, item.organization_id, btrim(location_address), nullif(btrim(location_city),''),
    nullif(btrim(location_state),''), nullif(btrim(location_zip),''),
    btrim(billing_type), btrim(billing_by), (select auth.uid())
  ) on conflict (intake_id) do update set
    job_location_address = excluded.job_location_address,
    job_location_city = excluded.job_location_city,
    job_location_state = excluded.job_location_state,
    job_location_zip = excluded.job_location_zip,
    billable_type = excluded.billable_type,
    billable_by = excluded.billable_by,
    verified_by = excluded.verified_by,
    verified_at = now();
  insert into public.intake_events (intake_id, actor_type, actor_id, event_type, detail)
    values (target_intake, 'employee', (select auth.uid()), 'service_details_verified', '{}'::jsonb);
  return true;
end;
$$;
revoke all on function public.smart_intake_verify_service_details(uuid,text,text,text,text,text,text) from public, anon;
grant execute on function public.smart_intake_verify_service_details(uuid,text,text,text,text,text,text) to authenticated;
