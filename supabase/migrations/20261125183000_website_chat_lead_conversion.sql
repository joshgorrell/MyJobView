create table public.website_chat_lead_links (
 conversation_id uuid primary key references public.website_chat_conversations(id) on delete cascade,
 lead_id uuid not null references public.leads(id) on delete restrict,
 created_at timestamptz not null default now()
);
alter table public.website_chat_lead_links enable row level security;
revoke all on public.website_chat_lead_links from public,anon,authenticated;
create function public.convert_website_chat_lead(p_conversation uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare c public.website_chat_conversations%rowtype; v_lead uuid; v_office uuid; v_contact uuid; v_username text; v_description text;
begin
 select * into c from public.website_chat_conversations where id=p_conversation for update;
 if not found or not public.website_chat_staff_allowed(c.organization_id) then raise exception 'Conversation unavailable'; end if;
 -- Limit record creation to dealer administrators until Pipeline-specific permissions are verified.
 if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.organization_id=c.organization_id and p.role='admin' and p.is_active and p.contact_id is null) then raise exception 'Lead creation unavailable'; end if;
 select lead_id into v_lead from public.website_chat_lead_links where conversation_id=c.id;
 if found then return v_lead; end if;
 if nullif(trim(c.visitor_name),'') is null or nullif(trim(c.visitor_email),'') is null then raise exception 'Contact details required'; end if;
 select id into v_office from public.company_offices where organization_id=c.organization_id order by display_order,id limit 1;
 if not found then raise exception 'Office unavailable'; end if;
 v_username:='chat_'||replace(c.id::text,'-','');
 select 'Website chat '||c.id::text||E'\n'||coalesce(string_agg(m.sender||': '||m.body,E'\n' order by m.created_at,m.id),'') into v_description from (select * from public.website_chat_messages where conversation_id=c.id and organization_id=c.organization_id order by created_at desc,id desc limit 30) m;
 perform pg_advisory_xact_lock(hashtextextended(c.organization_id::text||':email:'||lower(c.visitor_email),1));
 select id into v_contact from public.contacts where organization_id=c.organization_id and lower(email)=lower(c.visitor_email) order by id limit 1;
 if not found then
 insert into public.contacts(contact_name,first_name,last_name,username,email,notes,contact_type,portal_access_enabled,organization_id,office_id)
 values(c.visitor_name,split_part(c.visitor_name,' ',1),trim(substr(c.visitor_name,length(split_part(c.visitor_name,' ',1))+1)),v_username,lower(c.visitor_email),'Unverified website chat contact','lead',false,c.organization_id,v_office) returning id into v_contact;
 end if;
 insert into public.leads(contact_name,username,email,opportunity_description,priority,status,is_fishbowl,lead_source,converted_from_contact_id,organization_id,office_id)
 values(c.visitor_name,v_username,lower(c.visitor_email),left(v_description,12000),'low','unclaimed',true,'website',v_contact,c.organization_id,v_office) returning id into v_lead;
 insert into public.website_chat_lead_links(conversation_id,lead_id) values(c.id,v_lead);
 return v_lead;
end; $$;
revoke all on function public.convert_website_chat_lead(uuid) from public,anon;
grant execute on function public.convert_website_chat_lead(uuid) to authenticated;
