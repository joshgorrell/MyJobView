-- Store source snapshots privately until an import can be reconciled.
create table public.ipoint_sales_import_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  source_kind text not null check (source_kind in ('proposal', 'sales_order', 'invoice', 'payment', 'payment_allocation')),
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  coverage_start date not null,
  coverage_end date not null check (coverage_end >= coverage_start),
  status text not null default 'staged' check (status in ('staged', 'reconciled', 'failed')),
  created_at timestamptz not null default now(),
  unique (organization_id, source_kind, id),
  unique (organization_id, source_kind, coverage_start, coverage_end, source_sha256)
);

create table public.ipoint_sales_source_records (
  organization_id uuid not null,
  source_kind text not null,
  import_run_id uuid not null,
  source_id text not null check (btrim(source_id) <> ''),
  source_payload jsonb not null check (jsonb_typeof(source_payload) = 'object'),
  primary key (organization_id, source_kind, import_run_id, source_id),
  foreign key (organization_id, source_kind, import_run_id)
    references public.ipoint_sales_import_runs(organization_id, source_kind, id)
);

alter table public.ipoint_sales_import_runs enable row level security;
alter table public.ipoint_sales_source_records enable row level security;

revoke all on public.ipoint_sales_import_runs, public.ipoint_sales_source_records from public, anon, authenticated;
grant select, insert, update on public.ipoint_sales_import_runs to service_role;
grant select, insert on public.ipoint_sales_source_records to service_role;
