-- Manual service intake: one authenticated, tenant-scoped transaction.
-- Does not enable external ingestion or background routing.
create or replace function public.smart_intake_create_manual_service(
  target_org uuid, target_contact uuid, target_office uuid,
  request_subject text, request_details text, request_priority text,
  job_address text, job_city text, job_state text, job_zip text,
  billing_type text, billing_by text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  customer public.contacts%rowtype;
  request_id uuid;
  intake_id uuid;
  actor uuid := (select auth.uid());
begin
  if actor is null or not public.smart_intake_staff_can_read(target_org) then
    raise exception 'Not authorized for Smart Intake';
  end if;
  if request_subject is null or length(btrim(request_subject)) not between 1 and 200
    or request_details is null or length(btrim(request_details)) not between 1 and 10000
    or job_address is null or length(btrim(job_address)) not between 1 and 300
    or request_priority not in ('low','normal','high','urgent')
    or billing_type not in ('billable','warranty')
    or billing_by not in ('admin','dispatch','assigned_sales_rep','other_sales_rep')
    or target_office is null then
    raise exception 'Invalid service intake details';
  end if;
  select * into customer from public.contacts
    where id=target_contact and organization_id=target_org and office_id=target_office;
  if not found then raise exception 'Customer or office mismatch'; end if;
  if not exists (select 1 from public.company_offices
    where id=target_office and organization_id=target_org) then
    raise exception 'Office not found';
  end if;
  insert into public.service_requests (
    organization_id, contact_id, customer_name, customer_phone, customer_email,
    job_location_address, job_location_city, job_location_state, job_location_zip,
    job_description, billable_type, billable_by, priority, status, source_type,
    request_type, customer_contact_instruction, created_by
  ) values (
    target_org, target_contact,
    coalesce(nullif(btrim(customer.company_name),''),customer.contact_name),
    customer.phone, customer.email, btrim(job_address),
    nullif(btrim(job_city),''),nullif(btrim(job_state),''),nullif(btrim(job_zip),''),
    left(concat_ws(E'\n\n',btrim(request_subject),btrim(request_details)),10000),
    billing_type,billing_by,
    case when request_priority='urgent' then 'urgent' else 'normal' end,
    'open','other','service','dispatch',actor
  ) returning id into request_id;
  insert into public.intake_items (
    organization_id,office_id,channel,provider,provider_event_id,
    source_address,destination_address,subject,raw_body,status,classification,
    priority,contact_id,service_request_id
  ) values (
    target_org,target_office,'manual','manual',gen_random_uuid()::text,
    'staff:'||actor::text,'manual',btrim(request_subject),btrim(request_details),
    'processed','service',request_priority,target_contact,request_id
  ) returning id into intake_id;
  insert into public.intake_events (intake_id,actor_type,actor_id,event_type,detail)
  values (intake_id,'employee',actor,'manual_service_created',
    jsonb_build_object('service_request_id',request_id,'channel','manual'));
  return request_id;
end;
$$;
revoke all on function public.smart_intake_create_manual_service(uuid,uuid,uuid,text,text,text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.smart_intake_create_manual_service(uuid,uuid,uuid,text,text,text,text,text,text,text,text,text) to authenticated;