-- Expose only connected order identities to the organization's verified admins.
create or replace function public.get_techsafe_connected_orders()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_org uuid; v_role text; v_orders jsonb;
begin
 if auth.uid() is null then raise exception 'unauthorized' using errcode='42501'; end if;
 select organization_id,role into v_org,v_role from public.profiles where id=auth.uid();
 if v_org is null or v_role is distinct from 'admin' then raise exception 'admin_required' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('connectionId',c.connection_id,'orderId',c.sales_order_id,
 'orderNumber',s.order_number,'status',c.status,'enabled',c.enabled) order by s.order_number),'[]'::jsonb)
 into v_orders from techsafe_source.integration_connections c join public.sales_orders s
 on s.id=c.sales_order_id and s.organization_id=c.organization_id where c.organization_id=v_org;
 return v_orders;
end; $$;
revoke all on function public.get_techsafe_connected_orders() from public,anon;
grant execute on function public.get_techsafe_connected_orders() to authenticated;
