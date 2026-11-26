alter table public.website_chat_conversations add column assigned_staff_id uuid references public.profiles(id) on delete set null, add column first_staff_reply_at timestamptz;
update public.website_chat_conversations c set first_staff_reply_at=(select min(m.created_at) from public.website_chat_messages m where m.conversation_id=c.id and m.sender='staff');
grant select(assigned_staff_id,first_staff_reply_at) on public.website_chat_conversations to authenticated;
create function public.claim_website_chat(p_conversation uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.website_chat_conversations set assigned_staff_id=auth.uid() where id=p_conversation and status='open' and public.website_chat_staff_allowed(organization_id) and (assigned_staff_id is null or assigned_staff_id=auth.uid() or not exists(select 1 from public.profiles p where p.id=assigned_staff_id and p.organization_id=website_chat_conversations.organization_id and p.is_active and p.contact_id is null));
 if not found then raise exception 'Conversation unavailable'; end if;
end; $$;
create function public.release_website_chat(p_conversation uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.website_chat_conversations set assigned_staff_id=null where id=p_conversation and status='open' and assigned_staff_id=auth.uid() and public.website_chat_staff_allowed(organization_id);
 if not found then raise exception 'Conversation unavailable'; end if;
end; $$;
revoke all on function public.claim_website_chat(uuid),public.release_website_chat(uuid) from public,anon;
grant execute on function public.claim_website_chat(uuid),public.release_website_chat(uuid) to authenticated;
create or replace function public.reply_website_chat(p_conversation uuid,p_request uuid,p_body text)
returns uuid language plpgsql security definer set search_path='' as $$
declare c public.website_chat_conversations%rowtype; v_id uuid;
begin
 select * into c from public.website_chat_conversations where id=p_conversation for update;
 if not found or not public.website_chat_staff_allowed(c.organization_id) then raise exception 'Conversation unavailable'; end if;
 select id into v_id from public.website_chat_messages where conversation_id=c.id and request_id=p_request and staff_id=auth.uid();
 if found then return v_id; end if;
 if c.status<>'open' or p_body is null or length(trim(p_body)) not between 1 and 4000 then raise exception 'Invalid reply'; end if;
 perform public.claim_website_chat(c.id);
 insert into public.website_chat_messages(conversation_id,organization_id,request_id,sender,staff_id,body) values(c.id,c.organization_id,p_request,'staff',auth.uid(),trim(p_body)) returning id into v_id;
 update public.website_chat_conversations set first_staff_reply_at=coalesce(first_staff_reply_at,now()) where id=c.id;
 return v_id;
end; $$;
