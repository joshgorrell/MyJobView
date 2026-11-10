-- A lead exits the active Pipeline when its contact receives a proposal,
-- a billable time-and-materials service request, or a retail invoice.
-- Keep the lead and a durable source reference for reporting and audit.
create table if not exists public.lead_conversions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  lead_id uuid not null references public.leads(id) on delete cascade,
  contact_id uuid not null references public.contacts(id),
  conversion_type text not null check (conversion_type in ('proposal','service_request','retail_invoice')),
  source_id uuid not null,
  converted_at timestamptz not null default now(),
  unique (lead_id)
);

create index if not exists lead_conversions_source_idx
  on public.lead_conversions (organization_id, conversion_type, source_id);
alter table public.lead_conversions enable row level security;
create policy lead_conversions_read on public.lead_conversions
  for select to authenticated
  using (organization_id = public.get_user_org_id());

create or replace function private.convert_matching_leads(
  p_organization_id uuid, p_contact_id uuid, p_kind text,
  p_source_id uuid, p_source_created_at timestamptz
) returns void language plpgsql security definer set search_path = ''
as $$
declare v_lead record;
begin
  if p_organization_id is null or p_contact_id is null or p_source_id is null then return; end if;
  for v_lead in
    select id from public.leads
    where organization_id = p_organization_id
      and (contact_id = p_contact_id or converted_from_contact_id = p_contact_id)
      and converted_at is null
      and created_at <= coalesce(p_source_created_at, now())
    for update
  loop
    insert into public.lead_conversions
      (organization_id, lead_id, contact_id, conversion_type, source_id, converted_at)
    values (p_organization_id, v_lead.id, p_contact_id, p_kind, p_source_id,
            coalesce(p_source_created_at, now()))
    on conflict (lead_id) do nothing;
    update public.leads set converted_at = coalesce(p_source_created_at, now())
    where id = v_lead.id and converted_at is null;
  end loop;
end;
$$;

create or replace function private.convert_lead_on_proposal()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform private.convert_matching_leads(new.organization_id,new.contact_id,'proposal',new.id,new.created_at);
  return new;
end;
$$;
drop trigger if exists trg_convert_lead_on_proposal on public.proposals;
create trigger trg_convert_lead_on_proposal
after insert or update of contact_id on public.proposals
for each row execute function private.convert_lead_on_proposal();

create or replace function private.convert_lead_on_service_request()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  -- Only a billable service job is a sales conversion, not warranty/support.
  if new.billable_type = 'billable' and new.request_type = 'service' then
    perform private.convert_matching_leads(new.organization_id,new.contact_id,'service_request',new.id,new.created_at);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_convert_lead_on_service_request on public.service_requests;
create trigger trg_convert_lead_on_service_request
after insert or update of contact_id, billable_type, request_type on public.service_requests
for each row execute function private.convert_lead_on_service_request();

create or replace function private.convert_lead_on_retail_invoice()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  -- Do not mistake project, sales-order or service invoices for retail sales.
  if new.proposal_id is null and new.sales_order_id is null and new.project_id is null
    and (new.invoice_type in ('retail','retail_sale','retail_invoice')
      or new.source_type in ('retail','retail_sale','retail_invoice'))
    and coalesce(new.status,'') not in ('draft','void','voided','cancelled','canceled')
  then
    perform private.convert_matching_leads(new.organization_id,new.contact_id,'retail_invoice',new.id,new.created_at);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_convert_lead_on_retail_invoice on public.invoices;
create trigger trg_convert_lead_on_retail_invoice
after insert or update of contact_id, invoice_type, source_type, status on public.invoices
for each row execute function private.convert_lead_on_retail_invoice();
