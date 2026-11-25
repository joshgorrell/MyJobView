-- Correct the analytics source column to match the existing Pipeline schema.
create or replace function public.website_analytics_intake_totals(p_public_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare org uuid; since_at timestamptz:=now()-interval '30 days';
begin
 select s.organization_id into org from public.website_widget_settings s join public.profiles p on p.organization_id=s.organization_id where s.public_id=p_public_id and s.kind='analytics' and p.id=auth.uid() and p.is_active and p.contact_id is null and p.role='admin';
 if not found then raise exception 'Analytics unavailable'; end if;
 return jsonb_build_object('leads',(select count(*) from public.leads l where l.organization_id=org and l.lead_source='website' and l.created_at>=since_at),'service',(select count(*) from public.service_requests s where s.organization_id=org and s.source_type='website' and s.created_at>=since_at),'feedback',(select count(*) from public.customer_satisfaction s where s.organization_id=org and s.website_widget_id is not null and s.responded_at>=since_at),'chat',(select count(*) from public.website_chat_conversations c where c.organization_id=org and c.created_at>=since_at and exists(select 1 from public.website_chat_messages m where m.conversation_id=c.id and m.sender='visitor')));
end; $$;
