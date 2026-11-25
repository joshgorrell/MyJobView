-- Notify configured active staff, falling back to dealer administrators if none remain.
create function public.notify_website_intake(p_widget uuid,p_record uuid,p_kind text) returns void
language plpgsql security definer set search_path='' as $$
declare w public.website_widget_settings%rowtype; recipients jsonb; has_recipients boolean;
begin
 select * into w from public.website_widget_settings where id=p_widget and kind=p_kind;
 if not found or p_kind not in ('service','feedback') then return; end if;
 recipients:=w.options->'notification_recipients';
 if recipients is null or jsonb_typeof(recipients)<>'array' then recipients:='[]'::jsonb; end if;
 select exists(select 1 from public.profiles p where p.organization_id=w.organization_id and p.is_active and p.contact_id is null and recipients ? p.id::text) into has_recipients;
 insert into public.notifications(organization_id,user_id,type,title,body,related_id,is_read)
 select w.organization_id,p.id,case when p_kind='service' then 'service_request' else 'system' end,
 case when p_kind='service' then 'New website service request' else 'Website feedback needs review' end,
 case when p_kind='service' then 'Review the unverified request in Dispatch.' else 'Review the response in customer feedback.' end,p_record,false
 from public.profiles p where p.organization_id=w.organization_id and p.is_active and p.contact_id is null and ((has_recipients and recipients ? p.id::text) or (not has_recipients and p.role='admin'));
end; $$;
revoke all on function public.notify_website_intake(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.notify_website_intake(uuid,uuid,text) to service_role;

create or replace function public.create_website_service(p_widget uuid,p_origin text,p_request uuid,p_name text,p_email text,p_phone text,p_address text,p_city text,p_state text,p_zip text,p_description text)
returns uuid language plpgsql security invoker set search_path=public as $$
declare w public.website_widget_settings%rowtype; v_id uuid;
begin
 select * into w from public.website_widget_settings where public_id=p_widget and kind='service' and enabled and p_origin=any(allowed_origins) for share;
 if not found then raise exception 'Widget unavailable'; end if;
 perform pg_advisory_xact_lock(hashtextextended(w.id::text||':'||p_request::text,2));
 select service_request_id into v_id from public.website_service_receipts where widget_id=w.id and request_id=p_request;
 if found then return v_id; end if;
 insert into public.service_requests(organization_id,customer_name,customer_email,customer_phone,job_location_address,job_location_city,job_location_state,job_location_zip,job_description,billable_type,billable_by,status,source_type,customer_contact_instruction,notes)
 values(w.organization_id,p_name,p_email,p_phone,p_address,p_city,p_state,p_zip,p_description,'billable','dispatch','open','website','dispatch','Unverified website submission; verify identity and billing before scheduling.')
 returning id into v_id;
 insert into public.website_service_receipts values(w.id,p_request,v_id);
 perform public.notify_website_intake(w.id,v_id,'service');
 return v_id;
end; $$;
revoke all on function public.create_website_service(uuid,text,uuid,text,text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.create_website_service(uuid,text,uuid,text,text,text,text,text,text,text,text) to service_role;

create or replace function public.create_website_feedback(p_widget uuid,p_origin text,p_request uuid,p_name text,p_email text,p_rating text,p_comment text)
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
 if p_rating in ('okay','needs_attention') then perform public.notify_website_intake(w.id,v_id,'feedback'); end if;
 return v_id;
end; $$;
revoke all on function public.create_website_feedback(uuid,text,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.create_website_feedback(uuid,text,uuid,text,text,text,text) to service_role;
