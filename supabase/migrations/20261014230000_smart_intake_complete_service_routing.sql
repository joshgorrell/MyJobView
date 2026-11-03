-- Replace fail-closed skeleton after service details table is available.
-- One transaction locks intake + claim, creates request, records lineage, and completes.
create or replace function public.smart_intake_route_service(target_intake uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  item public.intake_items%rowtype;
  claim public.intake_routing_claims%rowtype;
  customer public.contacts%rowtype;
  details public.intake_service_details%rowtype;
  description_text text;
  request_id uuid;
begin
  if (select auth.role()) <> 'service_role' then raise exception 'Trusted processor required'; end if;
  select * into item from public.intake_items where id = target_intake for update;
  if not found then raise exception 'Intake not found'; end if;
  select * into claim from public.intake_routing_claims where intake_id = target_intake for update;
  if not found then raise exception 'Intake not queued'; end if;
  if claim.organization_id is distinct from item.organization_id then
    raise exception 'Routing claim tenant mismatch';
  end if;
  if claim.state = 'completed' then
    if claim.destination_kind <> 'service' or claim.destination_id is null then
      raise exception 'Inconsistent completed claim';
    end if;
    return claim.destination_id;
  end if;
  if claim.state <> 'pending' or item.status <> 'ready'
    or item.classification <> 'service' or item.contact_id is null
    or item.missing_fields is distinct from '[]'::jsonb then
    raise exception 'Intake not ready';
  end if;
  select * into customer from public.contacts
    where id = item.contact_id and organization_id = item.organization_id;
  if not found then raise exception 'Customer mismatch'; end if;
  select * into details from public.intake_service_details
    where intake_id = target_intake and organization_id = item.organization_id;
  if not found then raise exception 'Service details not verified'; end if;
  if item.office_id is null or customer.office_id is distinct from item.office_id
    or details.billable_type <> 'billable' or details.billable_by not in ('admin','dispatch') then
    raise exception 'Office or billing mismatch';
  end if;
  if exists (
    select 1 from public.intake_attachments a
    join public.intake_messages m on m.id = a.intake_message_id
    where m.intake_id = target_intake
      and (a.scan_status <> 'clean' or a.disposition = 'pending')
  ) then raise exception 'Attachments not cleared'; end if;
  select coalesce(nullif(btrim(item.raw_body), ''), (
    select nullif(btrim(m.body), '') from public.intake_messages m
    where m.intake_id = target_intake and m.direction = 'inbound'
      and nullif(btrim(m.body), '') is not null
    order by m.created_at limit 1
  )) into description_text;
  if description_text is null then raise exception 'Inbound content missing'; end if;
  insert into public.service_requests (
    organization_id, contact_id, customer_name, customer_phone, customer_email,
    job_location_address, job_location_city, job_location_state, job_location_zip,
    job_description, billable_type, billable_by, priority, status, source_type,
    request_type, customer_contact_instruction, created_by
  ) values (
    item.organization_id, item.contact_id,
    coalesce(nullif(btrim(customer.company_name),''), customer.contact_name),
    customer.phone, customer.email,
    details.job_location_address, details.job_location_city,
    details.job_location_state, details.job_location_zip,
    left(concat_ws(E'\n\n', nullif(item.subject,''), description_text), 10000),
    details.billable_type, details.billable_by,
    case when item.priority = 'urgent' then 'urgent' else 'normal' end,
    'open', 'other', 'service', 'dispatch', details.verified_by
  ) returning id into request_id;
  update public.intake_items
    set service_request_id = request_id, status = 'processed',
      updated_at = now(), last_activity_at = now()
    where id = target_intake;
  update public.intake_routing_claims
    set state = 'completed', destination_kind = 'service', destination_id = request_id,
      completed_at = now(), updated_at = now(), attempt_count = attempt_count + 1
    where intake_id = target_intake;
  insert into public.intake_events (intake_id, actor_type, event_type, detail)
    values (target_intake, 'system', 'service_request_created',
      jsonb_build_object('service_request_id', request_id));
  return request_id;
end;
$$;
revoke all on function public.smart_intake_route_service(uuid) from public, anon, authenticated;
grant execute on function public.smart_intake_route_service(uuid) to service_role;
