-- Atomic replacement avoids transient partial grants and failed insert after deletion.
create or replace function public.replace_phone_voicemail_department_grants(
  p_organization_id uuid, p_user_id uuid, p_departments text[]
) returns void language plpgsql security invoker set search_path = '' as $$
begin
  if p_departments is null or exists (
    select 1 from unnest(p_departments) d
    where d not in ('sales','service','projects','security','accounting','administration')
  ) then raise exception 'invalid departments'; end if;
  if not exists (select 1 from public.profiles
    where id = p_user_id and organization_id = p_organization_id and is_active = true) then
    raise exception 'user not found in organization';
  end if;
  delete from public.phone_voicemail_department_access
    where organization_id = p_organization_id and user_id = p_user_id;
  insert into public.phone_voicemail_department_access(organization_id,user_id,department)
    select p_organization_id,p_user_id,d from (select distinct unnest(p_departments) d) x;
end; $$;
revoke all on function public.replace_phone_voicemail_department_grants(uuid,uuid,text[])
  from public,anon,authenticated;
grant execute on function public.replace_phone_voicemail_department_grants(uuid,uuid,text[])
  to service_role;
