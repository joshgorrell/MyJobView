create table public.website_chat_rate_windows (
 conversation_id uuid not null references public.website_chat_conversations(id) on delete cascade,
 window_start timestamptz not null,
 attempts integer not null default 1,
 primary key(conversation_id,window_start)
);
alter table public.website_chat_rate_windows enable row level security;
revoke all on public.website_chat_rate_windows from public,anon,authenticated;
grant select,insert,update,delete on public.website_chat_rate_windows to service_role;
create function public.consume_website_chat_session_limit(p_conversation uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 insert into public.website_chat_rate_windows(conversation_id,window_start) values(p_conversation,date_trunc('minute',now()))
 on conflict(conversation_id,window_start) do update set attempts=website_chat_rate_windows.attempts+1 where website_chat_rate_windows.attempts<30 returning attempts into n;
 return n is not null;
end; $$;
revoke all on function public.consume_website_chat_session_limit(uuid) from public,anon,authenticated;
grant execute on function public.consume_website_chat_session_limit(uuid) to service_role;
-- Notify dealer administrators on the first visitor message only.
create function public.notify_website_chat_first_message() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.sender<>'visitor' then return new; end if;
 perform pg_advisory_xact_lock(hashtextextended(new.conversation_id::text,0));
 if exists(select 1 from public.website_chat_messages m where m.conversation_id=new.conversation_id and m.sender='visitor' and m.id<>new.id) then return new; end if;
 insert into public.notifications(organization_id,user_id,type,title,body,related_id,is_read)
 select new.organization_id,p.id,'message','New website chat','A website visitor has started a conversation.',new.conversation_id,false
 from public.profiles p where p.organization_id=new.organization_id and p.is_active and p.contact_id is null and p.role='admin';
 return new;
end; $$;
revoke all on function public.notify_website_chat_first_message() from public,anon,authenticated;
create trigger website_chat_first_message_notify after insert on public.website_chat_messages for each row execute function public.notify_website_chat_first_message();
