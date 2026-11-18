create function public.stage_ipoint_sales_snapshot(
  p_organization_id uuid,
  p_source_kind text,
  p_source_sha256 text,
  p_coverage_start date,
  p_coverage_end date,
  p_records jsonb
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  run_id uuid;
  expected_count integer;
  unique_count integer;
begin
  if jsonb_typeof(p_records) is distinct from 'array' then
    raise exception 'Snapshot records must be a JSON array';
  end if;

  expected_count := jsonb_array_length(p_records);
  select count(distinct value ->> 'source_id') into unique_count
  from jsonb_array_elements(p_records)
  where jsonb_typeof(value -> 'source_id') = 'string'
    and btrim(value ->> 'source_id') <> '';
  if unique_count <> expected_count then
    raise exception 'Snapshot records require distinct nonblank string source IDs';
  end if;

  insert into public.ipoint_sales_import_runs (
    organization_id, source_kind, source_sha256, coverage_start, coverage_end
  ) values (
    p_organization_id, p_source_kind, p_source_sha256, p_coverage_start, p_coverage_end
  )
  on conflict (organization_id, source_kind, coverage_start, coverage_end, source_sha256)
  do nothing
  returning id into run_id;

  if run_id is not null then
    insert into public.ipoint_sales_source_records (
      organization_id, source_kind, import_run_id, source_id, source_payload
    )
    select p_organization_id, p_source_kind, run_id, value ->> 'source_id', value
    from jsonb_array_elements(p_records);
    return run_id;
  end if;

  select id into strict run_id
  from public.ipoint_sales_import_runs
  where organization_id = p_organization_id and source_kind = p_source_kind
    and coverage_start = p_coverage_start and coverage_end = p_coverage_end
    and source_sha256 = p_source_sha256;

  if (select count(*) from public.ipoint_sales_source_records
      where organization_id = p_organization_id and source_kind = p_source_kind
        and import_run_id = run_id) <> expected_count
    or exists (
      select 1 from jsonb_array_elements(p_records) as incoming(record)
      where not exists (
        select 1 from public.ipoint_sales_source_records as saved
        where saved.organization_id = p_organization_id and saved.source_kind = p_source_kind
          and saved.import_run_id = run_id and saved.source_id = incoming.record ->> 'source_id'
          and saved.source_payload = incoming.record
      )
    ) then
    raise exception 'Snapshot differs from existing run with the same fingerprint';
  end if;

  return run_id;
end;
$$;

revoke all on function public.stage_ipoint_sales_snapshot(uuid, text, text, date, date, jsonb)
from public, anon, authenticated;
grant execute on function public.stage_ipoint_sales_snapshot(uuid, text, text, date, date, jsonb)
to service_role;
