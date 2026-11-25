create function public.website_analytics_sales(p_public_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare org uuid;
begin
 select w.organization_id into org from public.website_widget_settings w join public.profiles p on p.organization_id=w.organization_id where w.public_id=p_public_id and w.kind='analytics' and p.id=auth.uid() and p.role='admin' and p.is_active and p.contact_id is null;
 if not found then raise exception 'Analytics unavailable'; end if;
 return (with leads as (
 select id from public.leads where organization_id=org and lead_source='website' and created_at>=now()-interval '30 days'
 ), proposals as (
 select p.id,p.lead_id from public.proposals p join leads l on l.id=p.lead_id where p.organization_id=org
 ), orders as (
 select s.id,s.contract_total from public.sales_orders s join proposals p on p.id=s.proposal_id where s.company_id=org
 ), invoices as (
 select i.id from public.invoices i join orders s on s.id=i.sales_order_id where i.company_id=org and i.status not in ('void','draft')
 )
 select jsonb_build_object('converted',(select count(distinct lead_id) from proposals),'orders',(select count(*) from orders),'booked',(select coalesce(sum(contract_total),0) from orders),'collected',(select coalesce(sum(p.amount),0) from public.payments p join invoices i on i.id=p.invoice_id where p.company_id=org)));
end; $$;
revoke all on function public.website_analytics_sales(uuid) from public,anon;
grant execute on function public.website_analytics_sales(uuid) to authenticated;
