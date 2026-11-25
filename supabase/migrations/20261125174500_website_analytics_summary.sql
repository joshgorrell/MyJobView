create function public.website_analytics_summary(p_public_id uuid,p_days integer default 30)
returns table(day date,views bigint) language plpgsql stable security definer set search_path='' as $$
declare w uuid; today date:=(now() at time zone 'UTC')::date;
begin
 select s.id into w from public.website_widget_settings s join public.profiles p on p.organization_id=s.organization_id
 where s.public_id=p_public_id and s.kind='analytics' and p.id=auth.uid() and p.is_active and p.contact_id is null and p.role='admin';
 if not found then raise exception 'Analytics unavailable'; end if;
 if p_days is null or p_days not between 1 and 90 then raise exception 'Invalid date range'; end if;
 return query select d::date,coalesce(sum(a.views),0)::bigint
 from generate_series(today-p_days+1,today,interval '1 day') d
 left join public.website_analytics_daily a on a.widget_id=w and a.day=d::date
 group by d order by d;
end; $$;
revoke all on function public.website_analytics_summary(uuid,integer) from public,anon;
grant execute on function public.website_analytics_summary(uuid,integer) to authenticated;
