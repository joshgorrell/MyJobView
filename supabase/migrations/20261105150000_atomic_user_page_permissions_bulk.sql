-- Apply a complete page selection atomically. Each delegated call validates the
-- target user, administrator scope and page keys using the existing security checks.
-- PostgreSQL rolls back both calls if either raises an exception.
create or replace function public.set_user_page_permissions_bulk(
  p_user_id uuid,
  p_grant_keys text[],
  p_revoke_keys text[]
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  grants text[] := coalesce(p_grant_keys, '{}'::text[]);
  revokes text[] := coalesce(p_revoke_keys, '{}'::text[]);
begin
  if cardinality(grants) + cardinality(revokes) = 0
     or cardinality(grants) + cardinality(revokes) > 500
     or grants && revokes
     or array_position(grants, null) is not null
     or array_position(revokes, null) is not null then
    raise exception 'Choose a valid, nonoverlapping page selection' using errcode = '22023';
  end if;

  if cardinality(grants) > 0 then
    perform public.set_user_page_permissions(p_user_id, grants, true);
  end if;
  if cardinality(revokes) > 0 then
    perform public.set_user_page_permissions(p_user_id, revokes, false);
  end if;
end;
$$;

revoke all on function public.set_user_page_permissions_bulk(uuid, text[], text[]) from public, anon;
grant execute on function public.set_user_page_permissions_bulk(uuid, text[], text[]) to authenticated;
