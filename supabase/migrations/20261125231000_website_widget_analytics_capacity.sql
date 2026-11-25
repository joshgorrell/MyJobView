create or replace function public.consume_website_widget_limit(p_widget uuid)
returns boolean language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid;
  v_count integer;
  v_limit integer;
  v_window timestamptz := date_trunc('minute', now());
begin
  select id, case when kind = 'analytics' then 600 else 20 end into v_id, v_limit from public.website_widget_settings where public_id = p_widget and enabled;
  if not found then return false; end if;
  insert into public.website_widget_rate_windows(widget_id,window_start,attempts)
  values(v_id,v_window,1)
  on conflict(widget_id,window_start) do update set attempts = website_widget_rate_windows.attempts + 1
  where website_widget_rate_windows.attempts < v_limit
  returning attempts into v_count;
  return v_count is not null;
end;
$$;
revoke all on function public.consume_website_widget_limit(uuid) from public, anon, authenticated;
grant execute on function public.consume_website_widget_limit(uuid) to service_role;
