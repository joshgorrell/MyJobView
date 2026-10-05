-- Approved scopes extend the immutable sold packet. No legacy rows are auto-repaired.
CREATE SCHEMA IF NOT EXISTS handoff_private;
REVOKE ALL ON SCHEMA handoff_private FROM PUBLIC,anon,authenticated;
ALTER TABLE public.proposal_line_items ADD COLUMN equipment_removed boolean NOT NULL DEFAULT false;
ALTER TABLE public.change_orders ADD COLUMN handoff_applied_at timestamptz;
ALTER TABLE public.change_order_line_items ADD COLUMN applied_item_id uuid REFERENCES public.proposal_line_items(id);
CREATE TABLE public.project_scope_changes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES public.projects(id),
 organization_id uuid NOT NULL REFERENCES public.organizations(id),change_order_id uuid NOT NULL REFERENCES public.change_orders(id),
 scope jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(project_id,change_order_id)
);
ALTER TABLE public.project_scope_changes ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.project_scope_changes TO authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.project_scope_changes FROM PUBLIC,anon,authenticated;
CREATE POLICY project_scope_changes_read ON public.project_scope_changes FOR SELECT TO authenticated USING(organization_id=(SELECT get_user_org_id()));
CREATE FUNCTION handoff_private.scope_packet(p_proposal uuid,p_org uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path=public AS $$
 SELECT jsonb_build_object('captured_at',now(),'proposal_id',p_proposal,'overall_scope',(SELECT scope_of_work FROM proposal_settings WHERE proposal_id=p_proposal AND organization_id=p_org),
 'rooms',coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'description',r.description) ORDER BY sort_order) FROM proposal_rooms r WHERE proposal_id=p_proposal AND organization_id=p_org),'[]'),
 'equipment',coalesce((SELECT jsonb_agg(jsonb_build_object('id',i.id,'room_id',i.room_id,'description',i.description,'quantity',i.quantity,'unit',i.unit,'task_notes',i.task_notes,'programming_notes',i.programming_notes,'equipment_removed',i.equipment_removed,'phase_notes',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',ph.name,'notes',lp.tech_notes)),'[]') FROM proposal_line_item_labor_phases lp JOIN labor_phases ph ON ph.id=lp.labor_phase_id WHERE lp.line_item_id=i.id)) ORDER BY sort_order) FROM proposal_line_items i WHERE proposal_id=p_proposal AND organization_id=p_org AND NOT coalesce(is_hidden,false)),'[]'))
$$;
CREATE FUNCTION handoff_private.reconcile_tasks(p_project uuid,p_proposal uuid,p_org uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 INSERT INTO project_tasks(project_id,organization_id,title,description,labor_phase_id,status,sort_order,source_line_item_id,source_proposal_task_id,source,visibility,estimated_hours,room_name,covered_items)
 SELECT p_project,p_org,t.title,t.description,t.labor_phase_id,'open',t.sort_order,t.line_item_id,t.id,'proposal','internal',coalesce(t.estimated_hours,0),r.name,
 coalesce((SELECT jsonb_agg(jsonb_build_object('id',ci.id,'description',ci.description,'quantity',ci.quantity,'room_id',ci.room_id)) FROM proposal_line_items ci WHERE ci.proposal_id=p_proposal AND ci.organization_id=p_org AND (ci.id=t.line_item_id OR ci.id=ANY(t.covered_item_ids)) AND NOT coalesce(ci.is_hidden,false)),'[]')
 FROM proposal_tasks t LEFT JOIN proposal_line_items li ON li.id=t.line_item_id LEFT JOIN proposal_rooms r ON r.id=li.room_id
 WHERE t.proposal_id=p_proposal AND t.organization_id=p_org AND (t.line_item_id IS NULL OR NOT coalesce(li.is_hidden,false) OR EXISTS(SELECT 1 FROM proposal_line_items ci WHERE ci.id=ANY(t.covered_item_ids) AND ci.proposal_id=p_proposal AND NOT coalesce(ci.is_hidden,false)))
 AND NOT EXISTS(SELECT 1 FROM project_tasks old WHERE old.project_id=p_project AND (old.source_proposal_task_id=t.id OR (old.source_proposal_task_id IS NULL AND old.source_line_item_id=t.line_item_id)))
 ON CONFLICT(project_id,source_proposal_task_id) WHERE source_proposal_task_id IS NOT NULL DO NOTHING;
 UPDATE project_tasks t SET status='cancelled' WHERE project_id=p_project AND organization_id=p_org AND status='open' AND (source_line_item_id IS NOT NULL OR jsonb_array_length(covered_items)>0)
 AND NOT EXISTS(SELECT 1 FROM proposal_line_items i WHERE i.proposal_id=p_proposal AND i.organization_id=p_org AND NOT coalesce(i.is_hidden,false) AND (i.id=t.source_line_item_id OR EXISTS(SELECT 1 FROM jsonb_array_elements(t.covered_items) c WHERE c->>'id'=i.id::text)));
END $$;
CREATE OR REPLACE FUNCTION apply_change_order(p_change_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_co          change_orders%ROWTYPE;
  v_item        change_order_line_items%ROWTYPE;
  v_proposal_id uuid; v_room uuid; v_item_id uuid; v_project uuid;
BEGIN
  -- Load the change order
  SELECT * INTO v_co
  FROM change_orders
  WHERE id = p_change_order_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Change order % not found', p_change_order_id;
  END IF;

  IF pg_trigger_depth()=0 AND (auth.uid() IS NULL OR v_co.organization_id IS DISTINCT FROM get_user_org_id()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF v_co.handoff_applied_at IS NOT NULL THEN RETURN; END IF;
  IF v_co.status <> 'approved' THEN
    RAISE EXCEPTION 'Change order % must be in approved status to apply (current: %)',
      p_change_order_id, v_co.status;
  END IF;

  -- Resolve the parent proposal from the sales order
  SELECT proposal_id INTO v_proposal_id
  FROM sales_orders
  WHERE id = v_co.sales_order_id AND organization_id=v_co.organization_id;
  IF v_proposal_id IS NULL THEN RAISE EXCEPTION 'Source proposal missing'; END IF;
  IF EXISTS(SELECT 1 FROM change_order_line_items c WHERE c.change_order_id=p_change_order_id AND c.proposal_line_item_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM proposal_line_items i WHERE i.id=c.proposal_line_item_id AND i.proposal_id=v_proposal_id AND i.organization_id=v_co.organization_id)) THEN RAISE EXCEPTION 'Change item proposal mismatch'; END IF;

  -- Process each line item action
  FOR v_item IN
    SELECT *
    FROM change_order_line_items
    WHERE change_order_id = p_change_order_id
    ORDER BY sort_order NULLS LAST, created_at
  LOOP

    IF v_item.action_type = 'remove' THEN
      -- Permanently hide the removed line item
      UPDATE proposal_line_items
      SET    is_hidden  = coalesce(v_item.remove_scope,'parts_and_labor') <> 'parts_only',
             equipment_removed = true,
             description = CASE WHEN v_item.remove_scope='parts_only' THEN 'Labor — '||description ELSE description END,
             product_id = CASE WHEN v_item.remove_scope='parts_only' THEN NULL ELSE product_id END,
             item_type = CASE WHEN v_item.remove_scope='parts_only' THEN 'labor' ELSE item_type END,
             cost = CASE WHEN v_item.remove_scope='parts_only' THEN 0 ELSE cost END,
             unit_price = 0, line_total=0,
             updated_at = now()
      WHERE  id = v_item.proposal_line_item_id AND proposal_id=v_proposal_id;

    ELSIF v_item.action_type = 'add' THEN
      -- Insert a new line item on the proposal (skip if somehow already there)
      IF v_item.applied_item_id IS NULL AND v_item.proposal_line_item_id IS NOT NULL THEN
        IF NOT EXISTS(SELECT 1 FROM proposal_line_items WHERE id=v_item.proposal_line_item_id AND proposal_id=v_proposal_id AND organization_id=v_co.organization_id) THEN RAISE EXCEPTION 'Added item proposal mismatch'; END IF;
        UPDATE change_order_line_items SET applied_item_id=v_item.proposal_line_item_id WHERE id=v_item.id;
        PERFORM seed_proposal_tasks_for_line_item(v_item.proposal_line_item_id);
      ELSIF v_item.applied_item_id IS NULL THEN
        v_room:=NULL;
        IF nullif(coalesce(v_item.room_name,v_item.install_location),'') IS NOT NULL THEN
          SELECT id INTO v_room FROM proposal_rooms WHERE proposal_id=v_proposal_id AND name=coalesce(v_item.room_name,v_item.install_location) LIMIT 1;
          IF v_room IS NULL THEN INSERT INTO proposal_rooms(proposal_id,organization_id,name,sort_order) VALUES(v_proposal_id,v_co.organization_id,coalesce(v_item.room_name,v_item.install_location),999) RETURNING id INTO v_room; END IF;
        END IF;
        INSERT INTO proposal_line_items (
          proposal_id, room_id, labor_hours, labor_rate, labor_total, task_notes,
          product_id,
          description,
          quantity,
          unit_price,
          line_total,
          is_taxable,
          item_type,
          labor_phase_id,
          sort_order,
          organization_id,
          created_at,
          updated_at
        ) VALUES (
          v_proposal_id,v_room,coalesce(v_item.labor_hours,0),coalesce(v_item.labor_rate,0),coalesce(v_item.new_labor_total,v_item.labor_total,0),v_item.tech_notes,
          v_item.product_id,
          COALESCE(v_item.product_description, v_item.product_name),
          v_item.new_quantity,
          v_item.new_unit_price,
          ROUND(v_item.new_quantity * v_item.new_unit_price, 2),
          COALESCE(v_item.is_taxable, true),
          v_item.item_type,
          v_item.labor_phase_id,
          v_item.sort_order,
          v_co.organization_id,
          now(),
          now()
        ) RETURNING id INTO v_item_id;
        UPDATE change_order_line_items SET applied_item_id=v_item_id WHERE id=v_item.id;
        PERFORM seed_proposal_tasks_for_line_item(v_item_id);
      END IF;

    ELSIF v_item.action_type IN ('modify_quantity', 'modify_price') THEN
      UPDATE proposal_line_items
      SET
        quantity   = CASE WHEN v_item.action_type = 'modify_quantity'
                          THEN v_item.new_quantity ELSE quantity END,
        unit_price = CASE WHEN v_item.action_type = 'modify_price'
                          THEN v_item.new_unit_price ELSE unit_price END,
        line_total = ROUND(
          CASE WHEN v_item.action_type = 'modify_quantity'
               THEN v_item.new_quantity ELSE quantity END
          *
          CASE WHEN v_item.action_type = 'modify_price'
               THEN v_item.new_unit_price ELSE unit_price END
        , 2),
        updated_at = now()
      WHERE id = v_item.proposal_line_item_id AND proposal_id=v_proposal_id;

    ELSIF v_item.action_type = 'modify_labor' THEN
      UPDATE proposal_line_items
      SET
        labor_hours = v_item.labor_hours,
        labor_rate  = v_item.labor_rate,
        labor_total = v_item.new_labor_total,
        updated_at  = now()
      WHERE id = v_item.proposal_line_item_id AND proposal_id=v_proposal_id;

    -- modify_modifiers: no per-line-item change needed
    END IF;

  END LOOP;

  FOR v_project IN SELECT id FROM projects WHERE sales_order_id=v_co.sales_order_id AND organization_id=v_co.organization_id LOOP
    PERFORM handoff_private.reconcile_tasks(v_project,v_proposal_id,v_co.organization_id);
    INSERT INTO project_scope_changes(project_id,organization_id,change_order_id,scope) VALUES(v_project,v_co.organization_id,v_co.id,handoff_private.scope_packet(v_proposal_id,v_co.organization_id)||jsonb_build_object('change_title',v_co.title,'change_description',v_co.description));
  END LOOP;
  UPDATE change_orders SET handoff_applied_at=now() WHERE id=p_change_order_id;
  -- Lock the CO: mark is_active = false so it becomes historical
  UPDATE change_orders
  SET    is_active  = false,
         updated_at = now()
  WHERE  id = p_change_order_id;

  -- Recalculate proposal totals if helper function exists
  IF v_proposal_id IS NOT NULL THEN
    BEGIN
      PERFORM calculate_proposal_totals(v_proposal_id);
    EXCEPTION WHEN undefined_function THEN
      NULL;
    END;
  END IF;

END;
$$;

GRANT EXECUTE ON FUNCTION apply_change_order(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.apply_change_order(uuid) FROM PUBLIC,anon;

CREATE FUNCTION public.apply_approved_job_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.status='approved' AND OLD.status IS DISTINCT FROM 'approved' THEN PERFORM apply_change_order(NEW.id); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER apply_approved_job_change AFTER UPDATE OF status ON public.change_orders FOR EACH ROW EXECUTE FUNCTION public.apply_approved_job_change();
REVOKE ALL ON FUNCTION public.apply_approved_job_change() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA handoff_private FROM PUBLIC,anon,authenticated;

ALTER TABLE public.proposal_tasks ADD COLUMN estimate_is_manual boolean NOT NULL DEFAULT false;
ALTER TABLE public.project_tasks ADD COLUMN estimate_is_manual boolean NOT NULL DEFAULT false;
CREATE FUNCTION handoff_private.refresh_estimates(p_item uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE budget numeric; n integer; manual numeric;
BEGIN
 SELECT greatest(0,coalesce(quantity,1))*coalesce((SELECT sum(hours) FROM proposal_line_item_labor_phases WHERE line_item_id=p_item HAVING sum(hours)>0),coalesce(labor_hours,0)+coalesce(programming_labor_hours,0)) INTO budget FROM proposal_line_items WHERE id=p_item;
 SELECT count(*) FILTER(WHERE NOT estimate_is_manual),coalesce(sum(estimated_hours) FILTER(WHERE estimate_is_manual),0) INTO n,manual FROM proposal_tasks WHERE line_item_id=p_item;
 IF n>0 THEN UPDATE proposal_tasks SET estimated_hours=round(greatest(0,budget-manual)/n,3) WHERE line_item_id=p_item AND NOT estimate_is_manual; END IF;
 UPDATE project_tasks t SET estimated_hours=coalesce(p.estimated_hours,0) FROM proposal_tasks p WHERE t.source_proposal_task_id=p.id AND p.line_item_id=p_item AND NOT t.estimate_is_manual AND t.status='open';
END $$;
CREATE FUNCTION handoff_private.refresh_item_tasks() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN PERFORM seed_proposal_tasks_for_line_item(NEW.id); PERFORM handoff_private.refresh_estimates(NEW.id); RETURN NEW; END $$;
CREATE TRIGGER refresh_item_task_estimates AFTER UPDATE OF quantity,labor_hours,programming_labor_hours ON public.proposal_line_items FOR EACH ROW EXECUTE FUNCTION handoff_private.refresh_item_tasks();
CREATE FUNCTION handoff_private.refresh_phase_tasks() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN PERFORM seed_proposal_tasks_for_line_item(NEW.line_item_id); PERFORM handoff_private.refresh_estimates(NEW.line_item_id); RETURN NEW; END $$;
CREATE TRIGGER refresh_phase_task_estimates AFTER INSERT OR UPDATE OF hours ON public.proposal_line_item_labor_phases FOR EACH ROW EXECUTE FUNCTION handoff_private.refresh_phase_tasks();

-- Clone all job-content columns with fresh IDs. Suppress seeding until the
-- existing tasks and intentional omissions have been copied verbatim.
CREATE FUNCTION handoff_private.copy_content(p_source uuid,p_target uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE room record; item record; phase record; task record; settings record; fresh uuid; rooms jsonb:='{}'; items jsonb:='{}'; org uuid;
BEGIN
 SELECT organization_id INTO org FROM proposals WHERE id=p_source;
 IF NOT EXISTS(SELECT 1 FROM proposals WHERE id=p_target AND organization_id=org) THEN RAISE EXCEPTION 'Copy tenant mismatch'; END IF;
 FOR room IN SELECT * FROM proposal_rooms WHERE proposal_id=p_source ORDER BY sort_order LOOP
  fresh:=gen_random_uuid(); rooms:=rooms||jsonb_build_object(room.id::text,fresh);
  INSERT INTO proposal_rooms SELECT (jsonb_populate_record(NULL::proposal_rooms,to_jsonb(room)||jsonb_build_object('id',fresh,'proposal_id',p_target,'organization_id',org,'created_at',now(),'updated_at',now()))).*;
 END LOOP;
 FOR item IN SELECT * FROM proposal_line_items WHERE proposal_id=p_source ORDER BY sort_order LOOP
  fresh:=gen_random_uuid(); items:=items||jsonb_build_object(item.id::text,fresh);
  INSERT INTO proposal_line_items SELECT (jsonb_populate_record(NULL::proposal_line_items,to_jsonb(item)||jsonb_build_object('id',fresh,'proposal_id',p_target,'room_id',rooms->>item.room_id::text,'parent_item_id',NULL,'tasks_seeded_at',coalesce(item.tasks_seeded_at,now()),'created_at',now(),'updated_at',now()))).*;
 END LOOP;
 FOR item IN SELECT * FROM proposal_line_items WHERE proposal_id=p_source AND parent_item_id IS NOT NULL LOOP
  UPDATE proposal_line_items SET parent_item_id=(items->>item.parent_item_id::text)::uuid WHERE id=(items->>item.id::text)::uuid;
 END LOOP;
 FOR phase IN SELECT lp.* FROM proposal_line_item_labor_phases lp JOIN proposal_line_items i ON i.id=lp.line_item_id WHERE i.proposal_id=p_source LOOP
  INSERT INTO proposal_line_item_labor_phases SELECT (jsonb_populate_record(NULL::proposal_line_item_labor_phases,to_jsonb(phase)||jsonb_build_object('id',gen_random_uuid(),'line_item_id',items->>phase.line_item_id::text,'created_at',now(),'updated_at',now()))).*;
 END LOOP;
 FOR task IN SELECT * FROM proposal_tasks WHERE proposal_id=p_source ORDER BY sort_order LOOP
  INSERT INTO proposal_tasks SELECT (jsonb_populate_record(NULL::proposal_tasks,to_jsonb(task)||jsonb_build_object('id',gen_random_uuid(),'proposal_id',p_target,'line_item_id',items->>task.line_item_id::text,'covered_item_ids',to_jsonb(ARRAY(SELECT (items->>x::text)::uuid FROM unnest(task.covered_item_ids) x)),'created_at',now(),'updated_at',now()))).*;
 END LOOP;
 FOR settings IN SELECT * FROM proposal_settings WHERE proposal_id=p_source LOOP
  INSERT INTO proposal_settings SELECT (jsonb_populate_record(NULL::proposal_settings,to_jsonb(settings)||jsonb_build_object('id',gen_random_uuid(),'proposal_id',p_target,'organization_id',org,'created_at',now(),'updated_at',now()))).*;
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION create_proposal_revision(
  p_proposal_id uuid,
  p_revision_name text DEFAULT NULL,
  p_created_by uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_proposal_id    uuid;
  v_root_proposal_id   uuid;
  v_root_proposal_number text;
  v_next_revision_number integer;
  v_new_proposal_number text;
  v_room_mapping       jsonb := '{}'::jsonb;
  v_line_item_mapping  jsonb := '{}'::jsonb;
  v_old_room           record;
  v_new_room_id        uuid;
  v_line_item          record;
  v_new_line_item_id   uuid;
  v_old_labor_phase    record;
  v_old_task           record;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM proposals WHERE id=p_proposal_id AND organization_id=get_user_org_id()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  PERFORM 1 FROM proposals WHERE id=get_root_proposal_id(p_proposal_id) FOR UPDATE;
  v_root_proposal_id := get_root_proposal_id(p_proposal_id);

  SELECT
    CASE
      WHEN proposal_number ~ '-[0-9]+$' AND is_revision = true
      THEN regexp_replace(proposal_number, '-[0-9]+$', '')
      ELSE proposal_number
    END
  INTO v_root_proposal_number
  FROM proposals
  WHERE id = v_root_proposal_id;

  SELECT COALESCE(MAX(revision_number), 0) + 1
  INTO v_next_revision_number
  FROM proposals
  WHERE (id = v_root_proposal_id OR parent_proposal_id = v_root_proposal_id);

  v_new_proposal_number := v_root_proposal_number || '-' || v_next_revision_number::text;

  UPDATE proposals
  SET is_active_revision = false
  WHERE (id = v_root_proposal_id OR parent_proposal_id = v_root_proposal_id);

  INSERT INTO proposals (
    company_id, organization_id, contact_id, lead_id, proposal_number, title, status,
    valid_until, notes, customer_notes, subtotal, tax_rate, tax_amount, total,
    deposit_percent, deposit_amount, created_by, is_revision, parent_proposal_id,
    revision_name, is_active_revision, is_portal_visible, revision_number
  )
  SELECT
    company_id, organization_id, contact_id, lead_id, v_new_proposal_number, title, 'designing',
    valid_until, notes, customer_notes, subtotal, tax_rate, tax_amount, total,
    deposit_percent, deposit_amount, p_created_by, true, v_root_proposal_id,
    p_revision_name, true, false, v_next_revision_number
  FROM proposals
  WHERE id = p_proposal_id
  RETURNING id INTO v_new_proposal_id;

  PERFORM handoff_private.copy_content(p_proposal_id,v_new_proposal_id);

  RETURN v_new_proposal_id;
END;
$$;

CREATE FUNCTION public.duplicate_job_proposal(p_source uuid,p_contact uuid,p_title text,p_include boolean DEFAULT true) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE fresh uuid; original proposals; org uuid:=get_user_org_id();
BEGIN
 SELECT * INTO original FROM proposals WHERE id=p_source AND organization_id=org;
 IF auth.uid() IS NULL OR NOT FOUND OR NOT EXISTS(SELECT 1 FROM contacts WHERE id=p_contact AND organization_id=org) THEN RAISE EXCEPTION 'Not authorized'; END IF;
 INSERT INTO proposals(company_id,organization_id,contact_id,title,status,created_by,subtotal,tax_rate,tax_amount,total,tax_review_required)
 VALUES(original.company_id,org,p_contact,p_title,'designing',auth.uid(),CASE WHEN p_include THEN original.subtotal ELSE 0 END,original.tax_rate,CASE WHEN p_include THEN original.tax_amount ELSE 0 END,CASE WHEN p_include THEN original.total ELSE 0 END,true) RETURNING id INTO fresh;
 IF p_include THEN PERFORM handoff_private.copy_content(p_source,fresh); END IF;
 RETURN fresh;
END $$;
REVOKE ALL ON FUNCTION public.duplicate_job_proposal(uuid,uuid,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.duplicate_job_proposal(uuid,uuid,text,boolean) TO authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA handoff_private FROM PUBLIC,anon,authenticated;

CREATE TABLE public.project_retained_handoffs(project_id uuid PRIMARY KEY REFERENCES public.projects(id),organization_id uuid NOT NULL REFERENCES public.organizations(id),scope jsonb NOT NULL,reviewed_by uuid NOT NULL REFERENCES public.profiles(id),created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.project_retained_handoffs ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.project_retained_handoffs TO authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.project_retained_handoffs FROM PUBLIC,anon,authenticated;
CREATE POLICY retained_handoff_read ON public.project_retained_handoffs FOR SELECT TO authenticated USING(organization_id=(SELECT get_user_org_id()));
CREATE FUNCTION public.review_legacy_job_handoff(p_project uuid,p_items uuid[] DEFAULT NULL,p_capture boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE org uuid:=get_user_org_id(); proposal uuid; item uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('admin','manager','sales','service_manager','project_manager')) THEN RAISE EXCEPTION 'Manager review required'; END IF;
 SELECT so.proposal_id INTO proposal FROM projects p JOIN sales_orders so ON so.id=p.sales_order_id WHERE p.id=p_project AND p.organization_id=org;
 IF proposal IS NULL THEN RAISE EXCEPTION 'Source proposal not available'; END IF;
 IF p_items IS NOT NULL THEN
  PERFORM 1 FROM projects WHERE id=p_project FOR UPDATE;
  FOREACH item IN ARRAY p_items LOOP
   IF NOT EXISTS(SELECT 1 FROM proposal_line_items i WHERE i.id=item AND i.proposal_id=proposal AND i.organization_id=org AND i.tasks_seeded_at IS NULL AND NOT coalesce(i.is_hidden,false)) THEN RAISE EXCEPTION 'Item cannot be repaired; review its intentional task exclusions'; END IF;
   PERFORM seed_proposal_tasks_for_line_item(item);
  END LOOP;
  PERFORM handoff_private.reconcile_tasks(p_project,proposal,org);
 END IF;
 IF p_capture THEN INSERT INTO project_retained_handoffs(project_id,organization_id,scope,reviewed_by) VALUES(p_project,org,handoff_private.scope_packet(proposal,org),auth.uid()) ON CONFLICT(project_id) DO NOTHING; END IF;
 RETURN jsonb_build_object('scope',handoff_private.scope_packet(proposal,org),'candidates',coalesce((SELECT jsonb_agg(jsonb_build_object('id',i.id,'description',i.description,'room_name',r.name)) FROM proposal_line_items i LEFT JOIN proposal_rooms r ON r.id=i.room_id WHERE i.proposal_id=proposal AND i.organization_id=org AND i.tasks_seeded_at IS NULL AND NOT coalesce(i.is_hidden,false) AND (i.labor_hours>0 OR i.programming_labor_hours>0 OR EXISTS(SELECT 1 FROM proposal_line_item_labor_phases ph WHERE ph.line_item_id=i.id AND ph.hours>0))),'[]'));
END $$;
REVOKE ALL ON FUNCTION public.review_legacy_job_handoff(uuid,uuid[],boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.review_legacy_job_handoff(uuid,uuid[],boolean) TO authenticated;

-- Add approved and honestly labelled retained versions to the existing packet.
DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('public.get_work_order_project_context(uuid)'::regprocedure) INTO definition;
 IF position($needle$'sold_handoff',v_project.sold_handoff$needle$ in definition)=0 THEN RAISE EXCEPTION 'Unexpected project context definition'; END IF;
 definition:=replace(definition,$needle$'sold_handoff',v_project.sold_handoff$needle$, $replacement$'sold_handoff',v_project.sold_handoff,'retained_handoff',(SELECT scope FROM project_retained_handoffs WHERE project_id=v_project.id AND organization_id=v_profile.organization_id),'approved_scopes',coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'scope',c.scope,'created_at',c.created_at) ORDER BY c.created_at) FROM project_scope_changes c WHERE c.project_id=v_project.id AND c.organization_id=v_profile.organization_id),'[]')$replacement$);
 EXECUTE definition;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA handoff_private FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.keep_added_change_labor(p_change uuid,p_item uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE proposal uuid; li proposal_line_items; org uuid:=get_user_org_id();
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Staff authentication required'; END IF;
 SELECT so.proposal_id INTO proposal FROM change_orders co JOIN sales_orders so ON so.id=co.sales_order_id WHERE co.id=p_change AND co.organization_id=org AND co.status<>'approved' AND NOT coalesce(co.is_locked,false) FOR UPDATE OF co;
 SELECT * INTO li FROM proposal_line_items WHERE id=p_item AND proposal_id=proposal AND organization_id=org FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM change_order_line_items WHERE change_order_id=p_change AND proposal_line_item_id=p_item AND action_type='add' AND organization_id=org) THEN RAISE EXCEPTION 'Draft added item not found'; END IF;
 UPDATE proposal_line_items SET description='Labor — '||description,product_id=NULL,item_type='labor',unit_price=0,line_total=0,cost=0,equipment_removed=true,is_hidden=false WHERE id=p_item;
 UPDATE change_order_line_items SET product_id=NULL,product_name='Labor — '||li.description,product_description='Labor — '||li.description,item_type='labor',new_unit_price=0,new_labor_total=li.labor_total,labor_hours=li.labor_hours,labor_rate=li.labor_rate,applied_item_id=p_item WHERE change_order_id=p_change AND proposal_line_item_id=p_item AND action_type='add';
 PERFORM seed_proposal_tasks_for_line_item(p_item);
END $$;
REVOKE ALL ON FUNCTION public.keep_added_change_labor(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.keep_added_change_labor(uuid,uuid) TO authenticated;

-- Explicitly override Supabase's table default grants for immutable history.
REVOKE ALL ON public.project_scope_changes,public.project_retained_handoffs,public.work_order_task_updates FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.project_scope_changes,public.project_retained_handoffs,public.work_order_task_updates TO authenticated;
CREATE POLICY project_task_manager_write ON public.project_tasks AS RESTRICTIVE FOR UPDATE TO authenticated USING (EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND organization_id=project_tasks.organization_id AND role IN ('admin','manager','sales','service_manager','project_manager'))) WITH CHECK (EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND organization_id=project_tasks.organization_id AND role IN ('admin','manager','sales','service_manager','project_manager')));
