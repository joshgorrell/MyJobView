-- Customer-owned running list: saving is distinct from requesting service.
-- Keep legacy title/details columns so historical subjects and integrations survive.
CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.punchlist_customer_access(p_contact_id uuid, p_org_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_profile public.profiles%ROWTYPE; v_meta jsonb := auth.jwt()->'app_metadata';
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE id=auth.uid();
  -- Portal accounts may not have a profiles row; only admin-controlled claims identify them.
  IF coalesce((v_meta->>'is_portal_user')::boolean,false) OR v_profile.role='portal_user' THEN
    IF v_meta->>'contact_id' IS DISTINCT FROM p_contact_id::text
       OR v_meta->>'organization_id' IS DISTINCT FROM p_org_id::text THEN
      RAISE EXCEPTION 'Punchlist item access denied' USING ERRCODE='42501';
    END IF;
    RETURN true;
  END IF;
  IF v_profile.id IS NULL OR NOT coalesce(v_profile.is_active,false)
     OR v_profile.organization_id IS DISTINCT FROM p_org_id
     OR NOT public.flow_has_module_access('punchlist_admin') THEN
    RAISE EXCEPTION 'Punchlist item access denied' USING ERRCODE='42501';
  END IF;
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION private.punchlist_customer_access(uuid,uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.request_punchlist_service(p_task_ids uuid[], p_contact_id uuid, p_notes text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_contact public.contacts%ROWTYPE;
  v_ids uuid[];
  v_count int;
  v_request_id uuid;
  v_existing uuid[];
  v_description text;
BEGIN
  SELECT * INTO v_contact FROM public.contacts WHERE id=p_contact_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contact not found'; END IF;
  PERFORM private.punchlist_customer_access(p_contact_id,v_contact.organization_id);
  -- Serialize requests and item mutations for this customer, including concurrent retries.
  PERFORM 1 FROM public.contacts WHERE id=p_contact_id FOR UPDATE;
  SELECT array_agg(DISTINCT x ORDER BY x) INTO v_ids FROM unnest(p_task_ids) x WHERE x IS NOT NULL;
  IF coalesce(cardinality(v_ids),0)=0 THEN RAISE EXCEPTION 'Select at least one item'; END IF;
  SELECT count(*) INTO v_count FROM public.punchlist_tasks
  WHERE id=ANY(v_ids) AND contact_id=p_contact_id AND organization_id=v_contact.organization_id;
  IF v_count <> cardinality(v_ids) THEN RAISE EXCEPTION 'Invalid punchlist selection' USING ERRCODE='42501'; END IF;
  -- Exact retries return the existing open request, without extra requests or notifications.
  IF NOT EXISTS (SELECT 1 FROM public.punchlist_tasks WHERE id=ANY(v_ids)
                 AND (status <> 'requested' OR service_request_id IS NULL)) THEN
    SELECT array_agg(DISTINCT service_request_id) INTO v_existing FROM public.punchlist_tasks WHERE id=ANY(v_ids);
    IF cardinality(v_existing)=1 AND EXISTS (SELECT 1 FROM public.service_requests
        WHERE id=v_existing[1] AND status='open') THEN
      RETURN v_existing[1];
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM public.punchlist_tasks WHERE id=ANY(v_ids)
             AND (status <> 'draft' OR service_request_id IS NOT NULL OR work_order_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'Some selected items have already been requested. Refresh your list.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.punchlist_tasks WHERE id=ANY(v_ids)
             AND coalesce(nullif(btrim(details),''),nullif(btrim(title),'')) IS NULL) THEN
    RAISE EXCEPTION 'Describe what needs attention before requesting service';
  END IF;
  SELECT string_agg('- ' || coalesce(nullif(btrim(details),''),title), E'\n' ORDER BY priority_order,created_at,id)
  INTO v_description FROM public.punchlist_tasks WHERE id=ANY(v_ids);
  INSERT INTO public.service_requests (
    organization_id,contact_id,customer_name,customer_phone,customer_email,
    job_location_address,job_location_city,job_location_state,job_location_zip,
    job_description,billable_type,billable_by,priority,notes,status,source_type,created_by
  ) VALUES (
    v_contact.organization_id,p_contact_id,coalesce(v_contact.full_name,v_contact.company_name,'Customer'),
    v_contact.phone,v_contact.email,coalesce(v_contact.street_address,'Address on file'),
    v_contact.city,v_contact.state,v_contact.zip_code,
    'Punchlist Service Request' || E'\n\n' || v_description || coalesce(E'\n\nNotes: ' || nullif(btrim(p_notes),''),''),
    'warranty','admin','normal','Created from customer punchlist portal','open','punchlist',
    (SELECT id FROM public.profiles WHERE id=auth.uid())
  ) RETURNING id INTO v_request_id;
  UPDATE public.punchlist_tasks SET status='requested',service_request_id=v_request_id,
    requested_at=now(),updated_at=now() WHERE id=ANY(v_ids);
  RETURN v_request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_punchlist_item(p_task_id uuid,p_action text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_task public.punchlist_tasks%ROWTYPE;
  v_request public.service_requests%ROWTYPE;
  v_customer boolean;
BEGIN
  SELECT * INTO v_task FROM public.punchlist_tasks WHERE id=p_task_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item not found'; END IF;
  v_customer := private.punchlist_customer_access(v_task.contact_id,v_task.organization_id);
  PERFORM 1 FROM public.contacts WHERE id=v_task.contact_id FOR UPDATE;
  SELECT * INTO v_task FROM public.punchlist_tasks WHERE id=p_task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item not found'; END IF;
  IF v_task.service_request_id IS NOT NULL THEN
    SELECT * INTO v_request FROM public.service_requests WHERE id=v_task.service_request_id FOR UPDATE;
  END IF;
  IF p_action IN ('cancel','delete') AND (v_task.work_order_id IS NOT NULL OR v_request.work_order_id IS NOT NULL) THEN
    RAISE EXCEPTION 'A work order exists. Contact your service manager to make changes.';
  END IF;
  IF p_action='cancel' THEN
    IF v_task.status <> 'requested' THEN RAISE EXCEPTION 'This item has no pending service request'; END IF;
    UPDATE public.punchlist_tasks SET status='draft',service_request_id=NULL,requested_at=NULL,updated_at=now() WHERE id=p_task_id;
  ELSIF p_action='delete' THEN
    IF v_task.status NOT IN ('draft','requested') THEN RAISE EXCEPTION 'Only unrequested or pending items can be deleted'; END IF;
    DELETE FROM public.punchlist_tasks WHERE id=p_task_id;
  ELSIF p_action='complete' THEN
    UPDATE public.punchlist_tasks SET status='completed',completed_at=now(),
      completed_by=(SELECT id FROM public.profiles WHERE id=auth.uid()),
      completed_by_customer=v_customer,updated_at=now() WHERE id=p_task_id;
  ELSIF p_action='reopen' THEN
    IF v_task.status <> 'completed' THEN RAISE EXCEPTION 'Only completed items can be reopened'; END IF;
    UPDATE public.punchlist_tasks SET status='draft',service_request_id=NULL,work_order_id=NULL,
      requested_at=NULL,completed_at=NULL,completed_by=NULL,completed_by_customer=false,updated_at=now() WHERE id=p_task_id;
  ELSE RAISE EXCEPTION 'Invalid item action'; END IF;
  -- A pending request is cancelled only after its final active item is removed/resolved.
  -- A scheduled work order is never implicitly cancelled by a single item action.
  IF v_request.id IS NOT NULL AND v_request.work_order_id IS NULL AND v_request.status='open'
     AND NOT EXISTS (SELECT 1 FROM public.punchlist_tasks WHERE service_request_id=v_request.id AND status <> 'completed') THEN
    UPDATE public.service_requests SET status='cancelled' WHERE id=v_request.id;
  END IF;
  -- Keep pending request instructions aligned with remaining requested items.
  IF p_action IN ('cancel','delete','complete','reopen') AND v_request.id IS NOT NULL
     AND v_request.work_order_id IS NULL AND EXISTS (SELECT 1 FROM public.service_requests WHERE id=v_request.id AND status='open') THEN
    UPDATE public.service_requests SET job_description='Punchlist Service Request' || E'\n\n' ||
      (SELECT string_agg('- ' || coalesce(nullif(btrim(details),''),title),E'\n' ORDER BY priority_order,created_at,id)
       FROM public.punchlist_tasks WHERE service_request_id=v_request.id AND status <> 'completed')
      -- Original notes are retained on the request rather than silently discarded.
      || CASE WHEN v_request.job_description LIKE '%' || E'\n\nNotes: ' || '%' THEN
           E'\n\nNotes: ' || split_part(v_request.job_description,E'\n\nNotes: ',2) ELSE '' END
    WHERE id=v_request.id;
  END IF;
END;
$$;

-- Both legacy completion signatures share the same checked, atomic implementation.
CREATE OR REPLACE FUNCTION public.mark_punchlist_task_completed(p_task_id uuid,p_completed_by uuid DEFAULT NULL,p_completed_by_customer boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_completed_by IS NOT NULL AND p_completed_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Completion identity cannot be reassigned' USING ERRCODE='42501';
  END IF;
  PERFORM public.update_punchlist_item(p_task_id,'complete');
END;
$$;
CREATE OR REPLACE FUNCTION public.mark_punchlist_task_completed(p_task_id uuid,p_completed_by uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.mark_punchlist_task_completed(p_task_id,p_completed_by,false);
END;
$$;

-- Staff may cancel an entire pending request from the service queue.
CREATE OR REPLACE FUNCTION public.handle_service_request_cancellation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.status='cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    UPDATE public.punchlist_tasks SET status='draft',service_request_id=NULL,
      requested_at=NULL,updated_at=now()
    WHERE service_request_id=NEW.id AND status='requested';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_service_request_cancellation() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.notify_service_managers_new_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_punchlist boolean := NEW.source_type='punchlist' OR NEW.notes ILIKE '%Created from customer punchlist portal%';
BEGIN
  INSERT INTO public.notifications (user_id,organization_id,title,body,type,related_id,is_read,created_at)
  SELECT p.id,NEW.organization_id,
    CASE WHEN v_punchlist THEN 'New Punchlist Service Request' ELSE 'New Service Request' END,
    CASE WHEN v_punchlist THEN 'Customer ' || NEW.customer_name || ' requested service for punchlist items'
         ELSE 'Service request from ' || NEW.customer_name || ': ' || left(NEW.job_description,100) END,
    CASE WHEN v_punchlist THEN 'punchlist_service_request' ELSE 'service_request_created' END,
    coalesce(NEW.work_order_id,NEW.id),false,now()
  FROM public.profiles p WHERE p.organization_id=NEW.organization_id AND p.role='service_manager' AND p.is_active;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.request_punchlist_service(uuid[],uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.update_punchlist_item(uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.mark_punchlist_task_completed(uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.mark_punchlist_task_completed(uuid,uuid,boolean) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.notify_service_managers_new_request() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.request_punchlist_service(uuid[],uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_punchlist_item(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_punchlist_task_completed(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_punchlist_task_completed(uuid,uuid,boolean) TO authenticated;
