-- Deleting a lead also deletes the description snapshots in its Flow events.
-- This private trigger runs only after a lead deletion has passed its own RLS.
create or replace function private.cleanup_deleted_lead_flow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.flow_events
  where source_table = 'leads'
    and source_id = old.id
    and organization_id = old.organization_id;
  return old;
end;
$$;

revoke all on function private.cleanup_deleted_lead_flow() from public, anon, authenticated;

drop trigger if exists trg_cleanup_deleted_lead_flow on public.leads;
create trigger trg_cleanup_deleted_lead_flow
after delete on public.leads
for each row execute function private.cleanup_deleted_lead_flow();

-- Remove existing orphaned lead snapshots, including their cascaded read state.
-- Customer records and events sourced from other modules are preserved.
delete from public.flow_events f
where f.source_table = 'leads'
  and f.source_id is not null
  and not exists (
    select 1 from public.leads l
    where l.id = f.source_id and l.organization_id = f.organization_id
  );
