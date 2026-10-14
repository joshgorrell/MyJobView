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
