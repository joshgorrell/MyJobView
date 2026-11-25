create table public.website_chat_conversations (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 widget_id uuid not null references public.website_widget_settings(id) on delete cascade,
 visitor_token_hash text not null unique check(length(visitor_token_hash)=64),
 origin text not null,
 visitor_name text not null default '',
 visitor_email text not null default '',
 status text not null default 'open' check(status in ('open','closed')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(id,organization_id)
);
create table public.website_chat_messages (
 id uuid primary key default gen_random_uuid(),
 conversation_id uuid not null,
 organization_id uuid not null,
 request_id uuid not null,
 sender text not null check(sender in ('visitor','staff')),
 staff_id uuid references public.profiles(id) on delete set null,
 body text not null check(length(trim(body)) between 1 and 4000),
 created_at timestamptz not null default now(),
 foreign key(conversation_id,organization_id) references public.website_chat_conversations(id,organization_id) on delete cascade,
 unique(conversation_id,request_id),
 check(sender='staff' or staff_id is null)
);
create index website_chat_org_status on public.website_chat_conversations(organization_id,status,updated_at desc);
create index website_chat_message_order on public.website_chat_messages(conversation_id,created_at,id);
alter table public.website_chat_conversations enable row level security;
alter table public.website_chat_messages enable row level security;
revoke all on public.website_chat_conversations,public.website_chat_messages from public,anon,authenticated;
grant select,insert,update on public.website_chat_conversations,public.website_chat_messages to service_role;
-- Staff access is deliberately withheld until module authorization and reply RPCs are implemented.
