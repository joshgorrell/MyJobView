alter table public.service_requests drop constraint if exists service_requests_source_type_check;
alter table public.service_requests add constraint service_requests_source_type_check check (source_type in ('punchlist','staff_form','customer_portal','other','website'));
create table public.website_service_receipts (
  widget_id uuid not null references public.website_widget_settings(id) on delete cascade,
  request_id uuid not null,
  service_request_id uuid not null references public.service_requests(id) on delete cascade,
  primary key(widget_id,request_id)
);
alter table public.website_service_receipts enable row level security;
revoke all on public.website_service_receipts from public,anon,authenticated;
grant select,insert on public.website_service_receipts to service_role;
create function public.create_website_service(p_widget uuid,p_origin text,p_request uuid,p_name text,p_email text,p_phone text,p_address text,p_city text,p_state text,p_zip text,p_description text)
returns uuid language plpgsql security invoker set search_path=public as $$
declare w public.website_widget_settings%rowtype; v_id uuid;
begin
 select * into w from public.website_widget_settings where public_id=p_widget and kind='service' and enabled and p_origin=any(allowed_origins) for share;
 if not found then raise exception 'Widget unavailable'; end if;
 perform pg_advisory_xact_lock(hashtextextended(w.id::text||':'||p_request::text,2));
 select service_request_id into v_id from public.website_service_receipts where widget_id=w.id and request_id=p_request;
 if found then return v_id; end if;
 insert into public.service_requests(organization_id,customer_name,customer_email,customer_phone,job_location_address,job_location_city,job_location_state,job_location_zip,job_description,billable_type,billable_by,status,source_type,customer_contact_instruction,notes)
 values(w.organization_id,p_name,p_email,p_phone,p_address,p_city,p_state,p_zip,p_description,'billable','dispatch','open','website','dispatch','Unverified website submission; verify identity and billing before scheduling.')
 returning id into v_id;
 insert into public.website_service_receipts values(w.id,p_request,v_id);
 return v_id;
end; $$;
revoke all on function public.create_website_service(uuid,text,uuid,text,text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.create_website_service(uuid,text,uuid,text,text,text,text,text,text,text,text) to service_role;
