alter table public.customer_satisfaction add column if not exists website_widget_id uuid references public.website_widget_settings(id) on delete set null;
alter table public.customer_satisfaction add column if not exists website_request_id uuid;
create unique index customer_satisfaction_website_receipt on public.customer_satisfaction(website_widget_id,website_request_id) where website_widget_id is not null;
create function public.create_website_feedback(p_widget uuid,p_origin text,p_request uuid,p_name text,p_email text,p_rating text,p_comment text)
returns uuid language plpgsql security invoker set search_path=public as $$
declare w public.website_widget_settings%rowtype; v_id uuid;
begin
 select * into w from public.website_widget_settings where public_id=p_widget and kind='feedback' and enabled and p_origin=any(allowed_origins) for share;
 if not found then raise exception 'Widget unavailable'; end if;
 if p_rating not in ('excellent','good','okay','needs_attention') or length(p_comment)>5000 or length(p_name)>120 or length(p_email)>254 then raise exception 'Invalid feedback'; end if;
 perform pg_advisory_xact_lock(hashtextextended(w.id::text||':'||p_request::text,3));
 select id into v_id from public.customer_satisfaction where website_widget_id=w.id and website_request_id=p_request;
 if found then return v_id; end if;
 insert into public.customer_satisfaction(organization_id,customer_name,customer_email,rating,comment,responded_at,website_widget_id,website_request_id)
 values(w.organization_id,coalesce(p_name,''),coalesce(p_email,''),p_rating,p_comment,now(),w.id,p_request) returning id into v_id;
 return v_id;
end; $$;
revoke all on function public.create_website_feedback(uuid,text,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.create_website_feedback(uuid,text,uuid,text,text,text,text) to service_role;
