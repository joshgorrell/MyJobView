create table public.website_analytics_daily (
 widget_id uuid not null references public.website_widget_settings(id) on delete cascade,
 day date not null,
 page_path text not null check(length(page_path)<=200),
 views bigint not null default 0,
 primary key(widget_id,day,page_path)
);
alter table public.website_analytics_daily enable row level security;
revoke all on public.website_analytics_daily from public,anon,authenticated;
grant select,insert,update on public.website_analytics_daily to service_role;
grant select on public.website_analytics_daily to authenticated;
create policy website_analytics_admin_read on public.website_analytics_daily for select to authenticated using(exists(select 1 from public.website_widget_settings w join public.profiles p on p.organization_id=w.organization_id where w.id=widget_id and p.id=auth.uid() and p.is_active and p.contact_id is null and p.role='admin'));
create function public.record_website_view(p_public_id uuid,p_origin text,p_path text)
returns boolean language plpgsql security definer set search_path='' as $$
declare w uuid;
begin
 select id into w from public.website_widget_settings where public_id=p_public_id and kind='analytics' and enabled and p_origin=any(allowed_origins) for share;
 if not found then return false; end if;
 -- Aggregate only; never store URL parameters, identifiers or visitor IPs.
 if p_path is null or length(p_path)>200 or p_path !~ '^/[a-zA-Z0-9/_-]*$' then p_path:='/other'; end if;
 insert into public.website_analytics_daily(widget_id,day,page_path,views) values(w,(now() at time zone 'UTC')::date,p_path,1)
 on conflict(widget_id,day,page_path) do update set views=website_analytics_daily.views+1;
 return true;
end; $$;
revoke all on function public.record_website_view(uuid,text,text) from public,anon,authenticated;
grant execute on function public.record_website_view(uuid,text,text) to service_role;
