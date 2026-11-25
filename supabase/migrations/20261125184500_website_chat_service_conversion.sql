create table public.website_chat_service_links (
 conversation_id uuid primary key references public.website_chat_conversations(id) on delete cascade,
 service_request_id uuid not null references public.service_requests(id) on delete restrict,
 created_at timestamptz not null default now()
);
alter table public.website_chat_service_links enable row level security;
revoke all on public.website_chat_service_links from public,anon,authenticated;
create function public.convert_website_chat_service(p_conversation uuid,p_address text)
returns uuid language plpgsql security definer set search_path='' as $$
declare c public.website_chat_conversations%rowtype; v_id uuid; v_description text;
begin
 select * into c from public.website_chat_conversations where id=p_conversation for update;
 if not found or not public.website_chat_staff_allowed(c.organization_id) then raise exception 'Conversation unavailable'; end if;
 if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.organization_id=c.organization_id and p.role='admin' and p.is_active and p.contact_id is null) then raise exception 'Service creation unavailable'; end if;
 select service_request_id into v_id from public.website_chat_service_links where conversation_id=c.id;
 if found then return v_id; end if;
 if nullif(trim(c.visitor_name),'') is null or p_address is null or length(trim(p_address)) not between 1 and 500 then raise exception 'Contact and location required'; end if;
 select 'Website chat '||c.id::text||E'\n'||coalesce(string_agg(m.sender||': '||m.body,E'\n' order by m.created_at,m.id),'') into v_description from (select * from public.website_chat_messages where conversation_id=c.id and organization_id=c.organization_id order by created_at desc,id desc limit 30) m;
 insert into public.service_requests(organization_id,customer_name,customer_email,job_location_address,description,billable_type,billable_by,status,source_type,customer_contact_instruction,notes)
 values(c.organization_id,c.visitor_name,nullif(c.visitor_email,''),trim(p_address),left(v_description,12000),'billable','dispatch','pending','website','dispatch','Unverified website chat; verify identity and billing before scheduling.') returning id into v_id;
 insert into public.website_chat_service_links(conversation_id,service_request_id) values(c.id,v_id);
 return v_id;
end; $$;
revoke all on function public.convert_website_chat_service(uuid,text) from public,anon;
grant execute on function public.convert_website_chat_service(uuid,text) to authenticated;
