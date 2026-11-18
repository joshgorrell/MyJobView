-- Return historical proposal snapshot totals without exposing source payloads.
create function public.get_ipoint_proposal_monthly_stats()
returns table (
  month date,
  salesperson text,
  snapshot_count bigint,
  snapshot_amount numeric,
  coverage_start date,
  coverage_end date,
  imported_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with authorized_organization as (
    select p.organization_id
    from public.profiles as p
    where p.id = auth.uid()
      and p.is_active
      and p.can_view_executive_dashboard
  ),
  latest_snapshot as (
    select r.id, r.organization_id, r.coverage_start, r.coverage_end, r.created_at
    from public.ipoint_sales_import_runs as r
    join authorized_organization as a on a.organization_id = r.organization_id
    where r.source_kind = 'proposal' and r.status = 'reconciled'
    order by r.coverage_end desc, r.coverage_start, r.created_at desc, r.id desc
    limit 1
  )
  select
    date_trunc('month', (s.source_payload ->> 'created_date')::date::timestamp)::date,
    s.source_payload ->> 'reporting_salesperson',
    count(*),
    sum((s.source_payload ->> 'amount')::numeric),
    r.coverage_start,
    r.coverage_end,
    r.created_at
  from latest_snapshot as r
  join public.ipoint_sales_source_records as s
    on s.organization_id = r.organization_id
    and s.import_run_id = r.id
    and s.source_kind = 'proposal'
  group by 1, 2, 5, 6, 7
  order by 1 desc, 2;
$$;

revoke all on function public.get_ipoint_proposal_monthly_stats() from public, anon;
grant execute on function public.get_ipoint_proposal_monthly_stats() to authenticated;
