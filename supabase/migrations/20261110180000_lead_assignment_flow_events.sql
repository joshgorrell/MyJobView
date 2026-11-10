-- Emit canonical Flow activity when a Lead is assigned, including self-assignment.
-- Fishbowl (department) Leads produce a shared sales activity item; office scope
-- is preserved for existing Flow filters. Notifications remain managed separately.
create or replace function private.emit_lead_assignment_flow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_name text;
  v_recipient uuid;
begin
  if tg_op = 'UPDATE'
     and old.assigned_to is not distinct from new.assigned_to
     and old.is_fishbowl is not distinct from new.is_fishbowl
     and old.office_id is not distinct from new.office_id then
    return new;
  end if;

  select coalesce(p.full_name, 'MJV') into v_actor_name
    from public.profiles p where p.id = new.created_by;

  -- One recipient-specific Flow event per eligible salesperson. This ensures
  -- individual read/unread state, and avoids showing department leads to
  -- users outside the selected office.
  for v_recipient in
    select p.id from public.profiles p
    where p.organization_id = new.organization_id
      and p.is_active = true
      and (
        (new.assigned_to is not null and p.id = new.assigned_to)
        or (new.assigned_to is null and new.is_fishbowl = true
            and p.is_sales_rep = true
            and (new.office_id is null or exists (
              select 1 from public.user_offices u
              where u.user_id = p.id and u.office_id = new.office_id
            )))
      )
  loop
    insert into public.flow_events (
      organization_id, contact_id, office_id, actor_id, actor_name,
      customer_name, category, event_type, summary, details,
      source_table, source_id, required_module, activity_recipient_user_id
    ) values (
      new.organization_id, coalesce(new.contact_id, new.converted_from_contact_id),
      new.office_id, coalesce(auth.uid(), new.created_by),
      coalesce(v_actor_name, 'MJV'), coalesce(new.contact_name, new.company_name, 'New lead'),
      'sales', case when new.assigned_to is not null then 'leads.assigned' else 'leads.fishbowl' end,
      case when new.assigned_to is not null
        then 'Lead assigned · ' || coalesce(new.contact_name, new.company_name, 'New lead')
        else 'New unclaimed lead · ' || coalesce(new.contact_name, new.company_name, 'New lead') end,
      coalesce(new.opportunity_description, ''),
      'leads', new.id, 'feed', v_recipient
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_lead_assignment_flow on public.leads;
create trigger trg_lead_assignment_flow
after insert or update of assigned_to, is_fishbowl, office_id on public.leads
for each row execute function private.emit_lead_assignment_flow();

-- Restrict Lead events to the intended recipient even in the unfiltered Flow.
-- A department item stops appearing after another rep claims the Lead.
drop policy if exists flow_lead_recipient_scope on public.flow_events;
create policy flow_lead_recipient_scope on public.flow_events
as restrictive for select to authenticated
using (
  source_table <> 'leads'
  or (
    activity_recipient_user_id = (select auth.uid())
    and exists (
      select 1 from public.leads l
      where l.id = flow_events.source_id
        and l.organization_id = flow_events.organization_id
        and (
          event_type <> 'leads.fishbowl'
          or (l.assigned_to is null and l.is_fishbowl = true)
        )
    )
  )
);
