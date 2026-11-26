-- Scheduler entrypoint; call periodically from a trusted worker after ownership migration.
create table public.website_chat_escalations(
 conversation_id uuid primary key references public.website_chat_conversations(id) on delete cascade,
 escalated_at timestamptz not null default now()
);
alter table public.website_chat_escalations enable row level security;
revoke all on public.website_chat_escalations from public,anon,authenticated;
grant select,insert on public.website_chat_escalations to service_role;
create function public.escalate_unanswered_website_chats(p_limit integer default 100)
returns integer language plpgsql security definer set search_path='' as $$
declare item record; total integer:=0; inserted integer;
begin
 for item in
 select c.id,c.organization_id,w.options
 from public.website_chat_conversations c join public.website_widget_settings w on w.id=c.widget_id and w.organization_id=c.organization_id
 where c.status='open' and w.enabled and w.kind='chat'
 and not exists(select 1 from public.website_chat_escalations e where e.conversation_id=c.id)
 and not exists(select 1 from public.website_chat_messages m where m.conversation_id=c.id and m.sender='staff')
 and exists(select 1 from public.website_chat_messages m where m.conversation_id=c.id and m.sender='visitor' and m.created_at<=now()-make_interval(mins=>case when w.options->>'escalation_minutes' ~ '^[0-9]{1,2}$' then greatest(1,least(60,(w.options->>'escalation_minutes')::integer)) else 3 end))
 and jsonb_typeof(w.options->'backup_recipients')='array'
 and c.created_at>now()-interval '24 hours'
 order by c.created_at limit greatest(1,least(500,p_limit)) for update of c skip locked
 loop
 insert into public.notifications(organization_id,user_id,type,title,body,related_id,is_read)
 select item.organization_id,p.id,'message','Website chat awaiting reply','A website visitor is still waiting for a response.',item.id,false
 from public.profiles p where p.organization_id=item.organization_id and p.is_active and p.contact_id is null
 and (item.options->'backup_recipients') ? p.id::text
 and not exists(select 1 from public.notifications n where n.organization_id=item.organization_id and n.related_id=item.id and n.user_id=p.id and n.title in ('New website chat','Website chat awaiting reply'));
 get diagnostics inserted=row_count;
 if inserted>0 then
 insert into public.website_chat_escalations(conversation_id) values(item.id) on conflict do nothing;
 total:=total+1;
 end if;
 end loop;
 return total;
end; $$;
revoke all on function public.escalate_unanswered_website_chats(integer) from public,anon,authenticated;
grant execute on function public.escalate_unanswered_website_chats(integer) to service_role;
