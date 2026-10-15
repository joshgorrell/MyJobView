-- Create a customer and confirm an unmatched external intake in one transaction.
-- The same existing Smart Intake page-access predicate authorizes both actions.
-- No direct INSERT/UPDATE grants on intake evidence are required.
create or replace function public.smart_intake_create_customer_and_confirm(
  target_intake uuid,
  customer_name text,
  customer_email text default null,
  customer_phone text default null
) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  item_org uuid;
  current_contact uuid;
  current_status text;
  new_contact uuid;
  cleaned_name text := nullif(btrim(customer_name), '');
  cleaned_email text := nullif(lower(btrim(customer_email)), '');
  cleaned_phone text := nullif(btrim(customer_phone), '');
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;
  select organization_id, contact_id, status
    into item_org, current_contact, current_status
  from public.intake_items
  where id = target_intake and channel in ('email','sms','mms')
  for update;
  if item_org is null or not public.smart_intake_staff_can_read(item_org) then
    raise exception 'Not authorized to resolve this intake';
  end if;
  if current_contact is not null or current_status not in
    ('received','analyzing','awaiting_customer','awaiting_employee','needs_review','failed_retryable') then
    raise exception 'Intake is no longer awaiting customer resolution';
  end if;
  if cleaned_name is null or length(cleaned_name) > 200
    or length(coalesce(cleaned_email,'')) > 254
    or length(coalesce(cleaned_phone,'')) > 40 then
    raise exception 'Invalid customer details';
  end if;
  -- Refuse to create an obvious duplicate; employee can use existing-customer confirmation.
  if cleaned_email is not null and exists (
    select 1 from public.contacts
    where organization_id = item_org and lower(btrim(email)) = cleaned_email
  ) then
    raise exception 'A customer with this email already exists. Select the existing customer.';
  end if;
  insert into public.contacts (organization_id, company_name, email, phone)
    values (item_org, cleaned_name, cleaned_email, cleaned_phone)
    returning id into new_contact;
  update public.intake_items
    set contact_id = new_contact, updated_at = now()
    where id = target_intake;
  insert into public.intake_events (intake_id, actor_type, actor_id, event_type, detail)
    values (target_intake, 'employee', (select auth.uid()), 'customer_created_and_confirmed',
      jsonb_build_object('contact_id', new_contact));
  return new_contact;
end;
$$;
revoke all on function public.smart_intake_create_customer_and_confirm(uuid,text,text,text) from public, anon;
grant execute on function public.smart_intake_create_customer_and_confirm(uuid,text,text,text) to authenticated;
