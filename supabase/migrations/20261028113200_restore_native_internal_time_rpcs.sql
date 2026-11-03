-- Restores native Shop Time / Training RPCs deployed to MJV on 2026-10-28.
-- This is a reconciliation migration: existing functions are replaced idempotently.
-- Employee-owned, organization-scoped; invoker rights preserve RLS.
create or replace function public.start_internal_time(p_session_id uuid,p_session_type text,p_reason text default null,p_evidence jsonb default '{}'::jsonb)
returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); org uuid; sess public.internal_time_sessions%rowtype; entry_id uuid; punched_at timestamptz:=clock_timestamp();
begin
 if actor is null then raise exception 'Authentication required'; end if;
 org:=public.get_user_org_id();
 if org is null or p_session_type not in ('shop_time','training') then raise exception 'Invalid organization or activity type'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,314159));
 select * into sess from public.internal_time_sessions where id=p_session_id and organization_id=org and assigned_to=actor for update;
 if not found or sess.session_type<>p_session_type or sess.approved_by is null or sess.status not in ('scheduled','in_progress') then raise exception 'An approved, assigned session is required'; end if;
 if exists(select 1 from public.time_entries where organization_id=org and technician_id=actor and clock_out is null and status in ('draft','submitted')) then raise exception 'Stop your active job, Shop Time or Training timer first'; end if;
 insert into public.time_entries(organization_id,company_id,technician_id,internal_session_id,entry_type,entry_date,clock_in,status,notes,clock_in_gps_attempted_at,clock_in_gps_capture_method,clock_in_latitude,clock_in_longitude,clock_in_gps_accuracy,clock_in_gps_captured_at,clock_in_gps_duration_ms)
 values(org,org,actor,p_session_id,p_session_type,punched_at::date,punched_at,'draft',nullif(p_reason,''),(p_evidence->>'clock_in_gps_attempted_at')::timestamptz,coalesce(nullif(p_evidence->>'clock_in_gps_capture_method',''),'failed'),(p_evidence->>'clock_in_latitude')::real,(p_evidence->>'clock_in_longitude')::real,(p_evidence->>'clock_in_gps_accuracy')::real,(p_evidence->>'clock_in_gps_captured_at')::timestamptz,(p_evidence->>'clock_in_gps_duration_ms')::integer) returning id into entry_id;
 update public.internal_time_sessions set status='in_progress',updated_at=punched_at where id=p_session_id;
 return entry_id;
end $$;
create or replace function public.stop_internal_time(p_session_id uuid,p_notes text default null,p_evidence jsonb default '{}'::jsonb)
returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); org uuid; sess public.internal_time_sessions%rowtype; entry public.time_entries%rowtype; punched_at timestamptz:=clock_timestamp();
begin
 if actor is null then raise exception 'Authentication required'; end if;
 org:=public.get_user_org_id();
 if org is null then raise exception 'Organization required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,314159));
 select * into sess from public.internal_time_sessions where id=p_session_id and organization_id=org and assigned_to=actor for update;
 if not found or sess.status<>'in_progress' or sess.approved_by is null then raise exception 'No approved active session assigned to you'; end if;
 select * into entry from public.time_entries where internal_session_id=p_session_id and organization_id=org and technician_id=actor and clock_out is null and status='draft' for update;
 if not found then raise exception 'No active Shop Time or Training timer'; end if;
 update public.time_entries set clock_out=punched_at,total_hours=round((extract(epoch from(punched_at-entry.clock_in))/3600)::numeric,4),status='submitted',notes=concat_ws(E'\n',nullif(notes,''),nullif(p_notes,'')),clock_out_gps_attempted_at=(p_evidence->>'clock_out_gps_attempted_at')::timestamptz,clock_out_gps_capture_method=coalesce(nullif(p_evidence->>'clock_out_gps_capture_method',''),'failed'),clock_out_latitude=(p_evidence->>'clock_out_latitude')::real,clock_out_longitude=(p_evidence->>'clock_out_longitude')::real,clock_out_gps_accuracy=(p_evidence->>'clock_out_gps_accuracy')::real,clock_out_gps_captured_at=(p_evidence->>'clock_out_gps_captured_at')::timestamptz,clock_out_gps_duration_ms=(p_evidence->>'clock_out_gps_duration_ms')::integer where id=entry.id;
 update public.internal_time_sessions set status='completed',updated_at=punched_at where id=p_session_id;
 return entry.id;
end $$;
revoke all on function public.start_internal_time(uuid,text,text,jsonb) from public,anon;
revoke all on function public.stop_internal_time(uuid,text,jsonb) from public,anon;
grant execute on function public.start_internal_time(uuid,text,text,jsonb) to authenticated;
grant execute on function public.stop_internal_time(uuid,text,jsonb) to authenticated;
