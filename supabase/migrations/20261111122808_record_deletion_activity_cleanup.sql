-- Enforce deletion cleanup at the database boundary, including bulk/API deletes.
-- Child business records keep their existing CASCADE/RESTRICT/SET NULL semantics.
create or replace function private.cleanup_deleted_record_activity()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  notification_types text[] := case tg_table_name
    when 'work_orders' then array['work_order_assignment']
    when 'proposals' then array['proposal_message']
    when 'tasks' then array['task_assigned','task']
    when 'message_threads' then array['message','message_mention']
    when 'discussion_posts' then array['discussion_post_mention']
    when 'flow_updates' then array['flow_update_mention']
    else array[]::text[]
  end;
begin
  -- Flow updates are dependent notes, not independent business records.
  if tg_table_name in ('contacts','projects','work_orders') then
    delete from public.flow_updates u
    where u.organization_id = old.organization_id
      and case tg_table_name
        when 'contacts' then u.contact_id = old.id
        when 'projects' then u.project_id = old.id
        when 'work_orders' then u.work_order_id = old.id
      end;
  end if;

  delete from public.flow_events f
  where f.organization_id = old.organization_id
    and (
      (f.source_table = tg_table_name and f.source_id = old.id)
      or (tg_table_name = 'contacts' and f.contact_id = old.id)
      or (tg_table_name = 'projects' and f.project_id = old.id)
      or (tg_table_name = 'work_orders' and f.work_order_id = old.id)
    );

  -- Never interpret an untyped related_id without its verified notification type.
  -- Older notifications may lack organization_id; verify their recipient's org.
  delete from public.notifications n
  where n.related_id = old.id and n.type = any(notification_types)
    and (n.organization_id = old.organization_id
      or (n.organization_id is null and exists (
        select 1 from public.profiles p
        where p.id = n.user_id and p.organization_id = old.organization_id
      )));
  return old;
end;
$$;
revoke all on function private.cleanup_deleted_record_activity() from public, anon, authenticated;

do $$
declare source_name text;
begin
  foreach source_name in array array[
    'contacts','projects','work_orders','service_requests','change_orders',
    'product_requests','proposals','invoices','payments','project_notes',
    'customer_contact_log','flow_updates','leads','tasks','project_tasks',
    'message_threads','messages','discussion_posts','task_comments','project_task_activity'
  ] loop
    execute format('create trigger trg_cleanup_deleted_record_activity after delete on public.%I for each row execute function private.cleanup_deleted_record_activity()', source_name);
  end loop;
end;
$$;
