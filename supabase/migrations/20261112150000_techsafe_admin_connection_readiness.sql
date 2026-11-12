-- Read-only, tenant-scoped Techsafe connection readiness. No credentials or customer data.
create or replace function public.get_techsafe_integration_status()
returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog
as $$
declare v_org uuid; v_role text; v_total integer; v_active integer; v_last timestamptz;
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode='42501'; end if;
  select p.organization_id,p.role into v_org,v_role
  from public.profiles p where p.id=auth.uid();
  if v_org is null or v_role not in ('admin') then
    raise exception 'admin_required' using errcode='42501';
  end if;
  select count(*)::integer,
         count(*) filter (where enabled=true and status='active')::integer,
         max(updated_at)
  into v_total,v_active,v_last
  from techsafe_source.integration_connections
  where organization_id=v_org;
  return jsonb_build_object('registeredConnections',v_total,
    'activeConnections',v_active,'lastConnectionUpdate',v_last,
    'liveSyncEnabled',false,'sourceReaderCertified',false);
end; $$;
revoke all on function public.get_techsafe_integration_status() from public,anon;
grant execute on function public.get_techsafe_integration_status() to authenticated;
