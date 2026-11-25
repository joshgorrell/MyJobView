create function public.website_chat_staff_allowed(p_org uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=auth.uid() and p.organization_id=p_org and p.is_active and p.contact_id is null) and public.flow_has_module_access('messages');
$$;
revoke all on function public.website_chat_staff_allowed(uuid) from public,anon;
grant execute on function public.website_chat_staff_allowed(uuid) to authenticated;
-- Do not expose visitor token hashes to staff clients.
grant select(id,organization_id,widget_id,visitor_name,visitor_email,status,created_at,updated_at) on public.website_chat_conversations to authenticated;
grant select on public.website_chat_messages to authenticated;
create policy website_chat_staff_read on public.website_chat_conversations for select to authenticated using(public.website_chat_staff_allowed(organization_id));
create policy website_chat_staff_message_read on public.website_chat_messages for select to authenticated using(public.website_chat_staff_allowed(organization_id));
create function public.reply_website_chat(p_conversation uuid,p_request uuid,p_body text)
returns uuid language plpgsql security definer set search_path='' as $$
declare c public.website_chat_conversations%rowtype; v_id uuid;
begin
 select * into c from public.website_chat_conversations where id=p_conversation for update;
 if not found or not public.website_chat_staff_allowed(c.organization_id) then raise exception 'Conversation unavailable'; end if;
 select id into v_id from public.website_chat_messages where conversation_id=c.id and request_id=p_request and staff_id=auth.uid();
 if found then return v_id; end if;
 if c.status<>'open' or p_body is null or length(trim(p_body)) not between 1 and 4000 then raise exception 'Invalid reply'; end if;
 insert into public.website_chat_messages(conversation_id,organization_id,request_id,sender,staff_id,body)
 values(c.id,c.organization_id,p_request,'staff',auth.uid(),trim(p_body)) returning id into v_id;
 return v_id;
end; $$;
revoke all on function public.reply_website_chat(uuid,uuid,text) from public,anon;
grant execute on function public.reply_website_chat(uuid,uuid,text) to authenticated;
create function public.close_website_chat(p_conversation uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 update public.website_chat_conversations set status='closed',updated_at=now() where id=p_conversation and public.website_chat_staff_allowed(organization_id);
 if not found then raise exception 'Conversation unavailable'; end if;
end; $$;
revoke all on function public.close_website_chat(uuid) from public,anon;
grant execute on function public.close_website_chat(uuid) to authenticated;
create function public.touch_website_chat() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.website_chat_conversations set updated_at=now() where id=new.conversation_id and organization_id=new.organization_id;
 return new;
end; $$;
revoke all on function public.touch_website_chat() from public,anon,authenticated;
create trigger website_chat_message_touch after insert on public.website_chat_messages for each row execute function public.touch_website_chat();
