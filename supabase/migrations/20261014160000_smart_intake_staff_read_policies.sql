-- Smart Intake read-only staff access, scoped by authenticated profile and organization.
-- No INSERT/UPDATE/DELETE access to intake evidence is granted to employees.
-- Restrict to established service management roles pending granular department grants.
create or replace function public.smart_intake_staff_can_read(target_org uuid)
returns boolean language sql stable security invoker set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.organization_id = target_org
      and p.is_active is true
      and p.role in ('admin', 'manager', 'service_manager')
  );
$$;
revoke all on function public.smart_intake_staff_can_read(uuid) from public, anon;
grant execute on function public.smart_intake_staff_can_read(uuid) to authenticated;

create policy intake_items_staff_read on public.intake_items
for select to authenticated using (public.smart_intake_staff_can_read(organization_id));

create policy intake_messages_staff_read on public.intake_messages
for select to authenticated using (
  exists (select 1 from public.intake_items i where i.id = intake_id
    and public.smart_intake_staff_can_read(i.organization_id))
);

create policy intake_events_staff_read on public.intake_events
for select to authenticated using (
  exists (select 1 from public.intake_items i where i.id = intake_id
    and public.smart_intake_staff_can_read(i.organization_id))
);

create policy intake_attempts_staff_read on public.intake_processing_attempts
for select to authenticated using (
  exists (select 1 from public.intake_items i where i.id = intake_id
    and public.smart_intake_staff_can_read(i.organization_id))
);

create policy intake_delivery_staff_read on public.intake_delivery_events
for select to authenticated using (
  exists (select 1 from public.intake_items i where i.id = intake_id
    and public.smart_intake_staff_can_read(i.organization_id))
);

grant select on public.intake_items, public.intake_messages, public.intake_events,
  public.intake_processing_attempts, public.intake_delivery_events to authenticated;
-- Attachments remain inaccessible until malware scanning and signed URL access are implemented.


-- Explicit customer confirmation uses the same authorization rule as the
-- Smart Intake page. Do not grant direct employee UPDATE on intake evidence.
-- An unmatched item is locked to its first confirmed customer; concurrent
-- resolutions cannot silently overwrite each other.
create or replace function public.smart_intake_confirm_customer(
  target_intake uuid, target_contact uuid
) returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  item_org uuid;
  existing_contact uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;
  select organization_id, contact_id into item_org, existing_contact
  from public.intake_items
  where id = target_intake and channel in ('email','sms','mms')
  for update;
  if item_org is null or not public.smart_intake_staff_can_read(item_org) then
    raise exception 'Not authorized to resolve this intake';
  end if;
  if existing_contact is not null then
    raise exception 'Customer has already been confirmed';
  end if;
  if not exists (
    select 1 from public.contacts
    where id = target_contact and organization_id = item_org
  ) then
    raise exception 'Customer does not belong to this organization';
  end if;
  update public.intake_items
  set contact_id = target_contact, updated_at = now()
  where id = target_intake and contact_id is null;
  insert into public.intake_events (intake_id, actor_type, actor_id, event_type, detail)
  values (target_intake, 'employee', (select auth.uid()), 'customer_confirmed',
    jsonb_build_object('contact_id', target_contact));
  return true;
end;
$$;
revoke all on function public.smart_intake_confirm_customer(uuid,uuid) from public, anon;
grant execute on function public.smart_intake_confirm_customer(uuid,uuid) to authenticated;
