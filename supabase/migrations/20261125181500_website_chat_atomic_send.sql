create function public.send_website_chat_visitor(p_conversation uuid,p_hash text,p_request uuid,p_body text)
returns uuid language plpgsql security definer set search_path='' as $$
declare c public.website_chat_conversations%rowtype; v_id uuid;
begin
 select * into c from public.website_chat_conversations where id=p_conversation and visitor_token_hash=p_hash and created_at>now()-interval '24 hours' for update;
 if not found then raise exception 'Session unavailable'; end if;
 if not exists(select 1 from public.website_widget_settings w where w.id=c.widget_id and w.organization_id=c.organization_id and w.kind='chat' and w.enabled and c.origin=any(w.allowed_origins)) then raise exception 'Session unavailable'; end if;
 select id into v_id from public.website_chat_messages where conversation_id=c.id and request_id=p_request and sender='visitor';
 if found then return v_id; end if;
 if c.status<>'open' or p_body is null or length(trim(p_body)) not between 1 and 4000 then raise exception 'Invalid message'; end if;
 insert into public.website_chat_messages(conversation_id,organization_id,request_id,sender,body) values(c.id,c.organization_id,p_request,'visitor',trim(p_body)) returning id into v_id;
 return v_id;
end; $$;
revoke all on function public.send_website_chat_visitor(uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.send_website_chat_visitor(uuid,text,uuid,text) to service_role;
