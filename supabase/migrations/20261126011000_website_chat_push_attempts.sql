create table public.website_chat_push_attempts(
 notification_id uuid primary key references public.notifications(id) on delete cascade,
 created_at timestamptz not null default now()
);
alter table public.website_chat_push_attempts enable row level security;
revoke all on public.website_chat_push_attempts from public,anon,authenticated;
grant select,insert on public.website_chat_push_attempts to service_role;
create function public.claim_website_chat_push(p_org uuid,p_conversation uuid)
returns table(user_id uuid) language sql security definer set search_path='' as $$
 with eligible as (
 select n.id,n.user_id from public.notifications n
 join public.website_chat_conversations c on c.id=n.related_id and c.organization_id=n.organization_id
 join public.profiles p on p.id=n.user_id and p.organization_id=n.organization_id
 where n.organization_id=p_org and c.id=p_conversation and c.status='open'
 and n.type='message' and n.title='New website chat' and p.is_active and p.contact_id is null
 ), claimed as (
 insert into public.website_chat_push_attempts(notification_id) select id from eligible
 on conflict do nothing returning notification_id
 ) select e.user_id from eligible e join claimed a on a.notification_id=e.id;
$$;
revoke all on function public.claim_website_chat_push(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_website_chat_push(uuid,uuid) to service_role;
