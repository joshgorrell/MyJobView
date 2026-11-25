create table public.website_lead_notification_outbox (
  lead_id uuid primary key references public.leads(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  state text not null default 'pending' check (state in ('pending','sending','sent','review')),
  attempted_at timestamptz
);
alter table public.website_lead_notification_outbox enable row level security;
revoke all on public.website_lead_notification_outbox from public, anon, authenticated;
grant select, insert, update on public.website_lead_notification_outbox to service_role;

-- Service-role only; the public edge handler must validate origin, consent and abuse controls.
create or replace function public.create_website_lead(p_widget uuid, p_origin text, p_request uuid, p_name text, p_email text, p_phone text, p_description text)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  w public.website_widget_settings%rowtype;
  v_office uuid;
  v_contact uuid;
  v_lead uuid;
  v_rep uuid;
  v_username text := 'web_' || replace(p_request::text, '-', '');
begin
  select * into w from public.website_widget_settings where public_id = p_widget and kind = 'sales-lead' and enabled and p_origin = any(allowed_origins) for share;
  if not found then raise exception 'Widget unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended(w.organization_id::text || ':' || p_request::text, 0));
  select id into v_lead from public.leads where organization_id = w.organization_id and username = v_username and lead_source = 'website';
  if found then return v_lead; end if;
  select id into v_office from public.company_offices where organization_id = w.organization_id and (w.options->>'office_id' is null or id::text = w.options->>'office_id') order by display_order, id limit 1;
  if not found then raise exception 'Office unavailable'; end if;
 if nullif(w.options->>'rep_id','') is not null then
 select id into v_rep from public.profiles where organization_id = w.organization_id and id::text = w.options->>'rep_id' and is_active = true;
 if not found then raise exception 'Representative unavailable'; end if;
 end if;
  perform pg_advisory_xact_lock(hashtextextended(w.organization_id::text || ':email:' || lower(p_email), 1));
  select id into v_contact from public.contacts where organization_id = w.organization_id and lower(email) = lower(p_email) order by id limit 1;
  if not found then
    insert into public.contacts(contact_name, first_name, last_name, username, email, phone, notes, contact_type, portal_access_enabled, organization_id, office_id)
    values(p_name, split_part(p_name,' ',1), trim(substr(p_name,length(split_part(p_name,' ',1))+1)), v_username, lower(p_email), p_phone, 'Created from website inquiry', 'person', false, w.organization_id, v_office) returning id into v_contact;
  end if;
  insert into public.leads(contact_name, username, email, phone, opportunity_description, priority, status, is_fishbowl, lead_source, converted_from_contact_id, organization_id, office_id, assigned_to)
  values(p_name,v_username,lower(p_email),p_phone,p_description,'low',case when v_rep is null then 'unclaimed' else 'claimed' end,v_rep is null,'website',v_contact,w.organization_id,v_office,v_rep) returning id into v_lead;
  insert into public.website_lead_notification_outbox(lead_id, organization_id)
  values(v_lead,w.organization_id) on conflict (lead_id) do nothing;
  return v_lead;
end;
$$;
revoke all on function public.create_website_lead(uuid,text,uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.create_website_lead(uuid,text,uuid,text,text,text,text) to service_role;
