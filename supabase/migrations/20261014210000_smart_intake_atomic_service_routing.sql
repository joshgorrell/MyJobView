-- Atomic, idempotent routing for ready SERVICE intake only.
-- Other classifications remain pending until their destination contracts are defined.
-- The entire destination insert and completion update commit together.
create or replace function public.smart_intake_route_service(target_intake uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  intake public.intake_items%rowtype;
  claim public.intake_routing_claims%rowtype;
  contact public.contacts%rowtype;
  new_request uuid;
  body_text text;
  verified_details record;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'Trusted processor required';
  end if;
  select * into intake from public.intake_items where id = target_intake for update;
  if not found then raise exception 'Intake not found'; end if;
  select * into claim from public.intake_routing_claims
    where intake_id = target_intake for update;
  if not found then raise exception 'Intake has not passed routing readiness'; end if;
  if claim.state = 'completed' then
    if claim.destination_kind <> 'service' or claim.destination_id is null then
      raise exception 'Completed claim has incompatible destination';
    end if;
    return claim.destination_id;
  end if;
  if claim.state <> 'pending' or intake.status <> 'ready'
    or intake.classification <> 'service' or intake.contact_id is null
    or intake.missing_fields <> '[]'::jsonb then
    raise exception 'Intake is not ready for service routing';
  end if;
  select * into contact from public.contacts
    where id = intake.contact_id and organization_id = intake.organization_id;
  if not found then raise exception 'Customer mismatch'; end if;
  if intake.office_id is null or contact.office_id is distinct from intake.office_id then
    raise exception 'Office confirmation required';
  end if;
  if exists (
    select 1 from public.intake_attachments a
    join public.intake_messages m on m.id = a.intake_message_id
    where m.intake_id = target_intake
      and (a.scan_status <> 'clean' or a.disposition = 'pending')
  ) then raise exception 'Attachment review incomplete'; end if;
  select coalesce(nullif(btrim(intake.raw_body), ''), (
    select nullif(btrim(m.body), '') from public.intake_messages m
    where m.intake_id = target_intake and m.direction = 'inbound'
    and nullif(btrim(m.body), '') is not null
    order by m.created_at limit 1
  )) into body_text;
  if body_text is null then raise exception 'Message content incomplete'; end if;
  select * into verified_details from public.intake_service_details
    where intake_id = target_intake and organization_id = intake.organization_id;
  if not found then raise exception 'Service location and billing details must be verified'; end if;
  -- Service request fields requiring scheduling, billing, and location decisions
  -- cannot safely be inferred from a sender address. Do not fabricate them.
  -- A separately verified structured intake payload is required here.
  raise exception 'Service routing awaits validated location and billing payload';
end;
$$;
revoke all on function public.smart_intake_route_service(uuid) from public, anon, authenticated;
grant execute on function public.smart_intake_route_service(uuid) to service_role;
