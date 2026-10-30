-- Opt-in managed source boundary. No registrations or UI routing are enabled.
CREATE TABLE techsafe_source.managed_order_revisions (
  sales_order_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  revision bigint NOT NULL CHECK(revision>0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE techsafe_source.managed_finalizations (
  change_order_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  sales_order_id uuid NOT NULL,
  request jsonb NOT NULL,
  header_payload jsonb NOT NULL,
  result jsonb NOT NULL,
  finalized_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE techsafe_source.finalization_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  sales_order_id uuid NOT NULL,
  change_order_id uuid NOT NULL UNIQUE,
  revision bigint NOT NULL CHECK(revision>0),
  event_type text NOT NULL DEFAULT 'managed_change_finalized' CHECK(event_type='managed_change_finalized'),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(sales_order_id,revision)
);
ALTER TABLE techsafe_source.managed_order_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE techsafe_source.managed_finalizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE techsafe_source.finalization_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE techsafe_source.managed_order_revisions,techsafe_source.managed_finalizations,
  techsafe_source.finalization_outbox FROM PUBLIC,anon,authenticated;

-- Transaction-scoped proof that a checked wrapper is performing the mutation.
-- Browser roles cannot manufacture this context or trust a spoofable GUC flag.
CREATE TABLE techsafe_source.managed_mutation_context (
  transaction_id bigint NOT NULL,
  change_order_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  PRIMARY KEY(transaction_id,change_order_id)
);
ALTER TABLE techsafe_source.managed_mutation_context ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE techsafe_source.managed_mutation_context FROM PUBLIC,anon,authenticated;
CREATE FUNCTION techsafe_source.guard_managed_approval_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target uuid;
BEGIN
  IF TG_OP='DELETE' THEN target:=OLD.change_order_id; ELSE target:=NEW.change_order_id; END IF;
  IF auth.uid() IS NULL AND current_setting('role',true) NOT IN ('anon','authenticated')
    AND coalesce(current_setting('request.jwt.claim.role',true),'') NOT IN ('anon','authenticated') THEN
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  IF TG_OP='UPDATE' AND OLD.change_order_id IS DISTINCT FROM NEW.change_order_id AND EXISTS(
    SELECT 1 FROM techsafe_source.managed_change_orders WHERE change_order_id IN (OLD.change_order_id,NEW.change_order_id)) THEN
    RAISE EXCEPTION 'Managed approval ownership cannot be reassigned' USING ERRCODE='42501';
  END IF;
  IF EXISTS(SELECT 1 FROM techsafe_source.managed_change_orders WHERE change_order_id=target)
    AND NOT EXISTS(SELECT 1 FROM techsafe_source.managed_mutation_context WHERE transaction_id=txid_current()
      AND change_order_id=target AND actor_id=auth.uid()) THEN
    RAISE EXCEPTION 'Managed approval requires the checked transaction' USING ERRCODE='42501';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
REVOKE ALL ON FUNCTION techsafe_source.guard_managed_approval_write() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_techsafe_managed_approval_write BEFORE INSERT OR UPDATE OR DELETE ON public.change_order_approvals
  FOR EACH ROW EXECUTE FUNCTION techsafe_source.guard_managed_approval_write();
CREATE FUNCTION techsafe_source.guard_managed_change_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target uuid;
BEGIN
  IF TG_OP='INSERT' THEN target:=NEW.id; ELSE target:=OLD.id; END IF;
  IF NOT EXISTS(SELECT 1 FROM techsafe_source.managed_change_orders WHERE change_order_id=target) THEN
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  IF auth.uid() IS NULL AND current_setting('role',true) NOT IN ('anon','authenticated')
    AND coalesce(current_setting('request.jwt.claim.role',true),'') NOT IN ('anon','authenticated') THEN
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM techsafe_source.managed_mutation_context WHERE transaction_id=txid_current()
    AND change_order_id=target AND actor_id=auth.uid()) THEN
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  IF TG_OP='UPDATE' THEN
    IF OLD.status IS DISTINCT FROM 'approved' AND NEW.status IS NOT DISTINCT FROM OLD.status
      AND NEW.id IS NOT DISTINCT FROM OLD.id AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id
      AND NEW.sales_order_id IS NOT DISTINCT FROM OLD.sales_order_id THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'Managed approval/status change requires the checked transaction' USING ERRCODE='42501';
END;
$$;
REVOKE ALL ON FUNCTION techsafe_source.guard_managed_change_write() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_techsafe_managed_change_write BEFORE INSERT OR UPDATE OR DELETE ON public.change_orders
  FOR EACH ROW EXECUTE FUNCTION techsafe_source.guard_managed_change_write();

CREATE FUNCTION techsafe_source.finalize_managed_change_order(
  p_change_order_id uuid,p_approval_id uuid DEFAULT NULL,p_notes text DEFAULT NULL,p_portal_action text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.profiles%ROWTYPE; initial public.change_orders%ROWTYPE;
  co public.change_orders%ROWTYPE; sales public.sales_orders%ROWTYPE;
  registration techsafe_source.managed_change_orders%ROWTYPE;
  approval public.change_order_approvals%ROWTYPE;
  prior techsafe_source.managed_finalizations%ROWTYPE;
  note text:=nullif(btrim(p_notes),''); request jsonb; application jsonb;
  remaining integer; visible boolean; version bigint; result jsonb; header jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT * INTO actor FROM public.profiles WHERE id=auth.uid() AND is_active IS TRUE
    AND role IN ('admin','office_manager','project_manager');
  IF NOT FOUND THEN RAISE EXCEPTION 'Active change-order approver required' USING ERRCODE='42501'; END IF;
  SELECT * INTO initial FROM public.change_orders WHERE id=p_change_order_id AND organization_id=actor.organization_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Change order is not available in your organization' USING ERRCODE='42501'; END IF;
  IF (note IS NOT NULL AND length(note)>4000) OR (p_portal_action IS NOT NULL AND p_portal_action NOT IN ('keep','hide')) THEN
    RAISE EXCEPTION 'Invalid finalization options' USING ERRCODE='22023';
  END IF;
  SELECT * INTO registration FROM techsafe_source.managed_change_orders WHERE change_order_id=initial.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Change order is not registered for managed finalization' USING ERRCODE='55000'; END IF;
  SELECT * INTO sales FROM public.sales_orders WHERE id=registration.sales_order_id
    AND organization_id=actor.organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registered order is unavailable' USING ERRCODE='42501'; END IF;
  SELECT * INTO co FROM public.change_orders WHERE id=initial.id FOR UPDATE;
  IF co.organization_id IS DISTINCT FROM actor.organization_id OR co.sales_order_id IS DISTINCT FROM sales.id
    OR registration.organization_id IS DISTINCT FROM actor.organization_id THEN
    RAISE EXCEPTION 'Managed source binding changed' USING ERRCODE='42501';
  END IF;
  request:=jsonb_build_object('approval_id',p_approval_id,'notes',note,'portal_action',p_portal_action);
  header:=jsonb_build_object('change_amount',co.change_amount,'tax_amount',co.tax_amount,'is_billable',co.is_billable,
    'requires_customer_approval',co.requires_customer_approval);
  SELECT * INTO prior FROM techsafe_source.managed_finalizations WHERE change_order_id=co.id;
  IF FOUND THEN
    IF prior.organization_id IS DISTINCT FROM actor.organization_id OR prior.sales_order_id IS DISTINCT FROM sales.id
      OR prior.request IS DISTINCT FROM request OR prior.header_payload IS DISTINCT FROM header THEN
      RAISE EXCEPTION 'Finalization already completed with a different request' USING ERRCODE='22023';
    END IF;
    -- Also rejects changed payloads or an invalidated/reopened application.
    application:=techsafe_source.apply_managed_change_order(co.id);
    RETURN prior.result||jsonb_build_object('finalization_status','duplicate');
  END IF;
  IF co.status IS NULL OR co.status NOT IN ('draft','pending_approval') THEN
    RAISE EXCEPTION 'Cannot certify a separately approved or closed change order' USING ERRCODE='55000';
  END IF;
  IF co.requires_new_proposal IS TRUE OR co.transferred_to_proposal_id IS NOT NULL THEN
    RAISE EXCEPTION 'Proposal-transfer adapter required for this change order' USING ERRCODE='55000';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.change_orders'::regclass
    AND tgfoid=to_regprocedure('public.recalc_sales_order_contract_total()') AND tgenabled IN ('O','A') AND NOT tgisinternal)
    OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.change_orders'::regclass
      AND tgfoid=to_regprocedure('public.guard_finalization_tax_check()') AND tgenabled IN ('O','A') AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'Active contract-total and tax guards are required' USING ERRCODE='55000';
  END IF;
  -- Customer approval needs trusted evidence, not a browser-editable flag. This
  -- first endpoint supports staff-only managed COs until that adapter is ready.
  IF co.requires_customer_approval IS TRUE OR EXISTS(SELECT 1 FROM public.change_order_approvals
    WHERE change_order_id=co.id AND required IS TRUE AND approver_role='customer') THEN
    RAISE EXCEPTION 'Verified customer-approval adapter required for this change order' USING ERRCODE='55000';
  END IF;
  PERFORM 1 FROM public.change_order_approvals WHERE change_order_id=co.id ORDER BY approval_level,id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.change_order_approvals WHERE change_order_id=co.id
    AND organization_id IS DISTINCT FROM actor.organization_id) THEN
    RAISE EXCEPTION 'Approval organization mismatch' USING ERRCODE='42501';
  END IF;
  INSERT INTO techsafe_source.managed_mutation_context(transaction_id,change_order_id,actor_id)
  VALUES(txid_current(),co.id,actor.id);
  IF p_approval_id IS NOT NULL THEN
    SELECT * INTO approval FROM public.change_order_approvals WHERE id=p_approval_id AND change_order_id=co.id;
    IF NOT FOUND OR approval.approver_role IS NULL OR approval.approver_role NOT IN ('project_manager','office_manager')
      OR (actor.role<>'admin' AND actor.role<>approval.approver_role) THEN
      RAISE EXCEPTION 'This approval step is not available to this actor' USING ERRCODE='42501';
    END IF;
    IF EXISTS(SELECT 1 FROM public.change_order_approvals WHERE change_order_id=co.id AND required IS TRUE
      AND approval_level<approval.approval_level AND status IS DISTINCT FROM 'approved') THEN
      RAISE EXCEPTION 'Earlier required approval is incomplete' USING ERRCODE='55000';
    END IF;
    IF approval.status='pending' THEN
      UPDATE public.change_order_approvals SET status='approved',approver_id=actor.id,approved_date=now(),notes=note WHERE id=approval.id;
    ELSIF approval.status IS DISTINCT FROM 'approved' OR approval.notes IS DISTINCT FROM note THEN
      RAISE EXCEPTION 'Approval already resolved or request changed' USING ERRCODE='22023';
    END IF;
  END IF;
  SELECT count(*) INTO remaining FROM public.change_order_approvals WHERE change_order_id=co.id
    AND required IS TRUE AND status IS DISTINCT FROM 'approved';
  IF remaining>0 THEN
    UPDATE public.change_orders SET status='pending_approval',updated_at=now() WHERE id=co.id;
    DELETE FROM techsafe_source.managed_mutation_context WHERE transaction_id=txid_current() AND change_order_id=co.id;
    RETURN jsonb_build_object('finalization_status','awaiting_approvals','remaining',remaining);
  END IF;
  SELECT is_portal_visible INTO visible FROM public.proposals WHERE id=sales.proposal_id
    AND organization_id=actor.organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Parent proposal is unavailable' USING ERRCODE='42501'; END IF;
  IF visible IS TRUE AND p_portal_action IS NULL THEN
    RAISE EXCEPTION 'Explicit portal keep-or-hide decision required' USING ERRCODE='55000';
  END IF;
  IF p_portal_action='hide' THEN UPDATE public.proposals SET is_portal_visible=false WHERE id=sales.proposal_id; END IF;
  -- Existing tax, locking, contract-total and labor-target triggers run here,
  -- inside the same transaction as equipment application and source events.
  UPDATE public.change_orders SET status='approved',approved_by=actor.id,approved_by_name=actor.full_name,
    approval_date=now(),approval_notes=coalesce(note,approval_notes),is_locked=true,is_active=false,updated_at=now()
    WHERE id=co.id;
  application:=techsafe_source.apply_managed_change_order(co.id);
  SELECT * INTO co FROM public.change_orders WHERE id=p_change_order_id;
  header:=jsonb_build_object('change_amount',co.change_amount,'tax_amount',co.tax_amount,'is_billable',co.is_billable,
    'requires_customer_approval',co.requires_customer_approval);
  INSERT INTO techsafe_source.managed_order_revisions(sales_order_id,organization_id,revision)
  VALUES(sales.id,actor.organization_id,1)
  ON CONFLICT(sales_order_id) DO UPDATE SET revision=techsafe_source.managed_order_revisions.revision+1,updated_at=now()
    WHERE techsafe_source.managed_order_revisions.organization_id=EXCLUDED.organization_id
  RETURNING revision INTO version;
  IF version IS NULL THEN RAISE EXCEPTION 'Managed order revision organization mismatch' USING ERRCODE='42501'; END IF;
  INSERT INTO techsafe_source.finalization_outbox(organization_id,sales_order_id,change_order_id,revision,payload)
  VALUES(actor.organization_id,sales.id,co.id,version,jsonb_build_object('schemaVersion',1,'organizationId',actor.organization_id,
    'orderId',sales.id,'changeOrderId',co.id,'revision',version,'reason','managed_change_finalized'));
  result:=jsonb_build_object('finalization_status','finalized','change_order_id',co.id,'revision',version,'application',application);
  INSERT INTO techsafe_source.managed_finalizations(change_order_id,organization_id,sales_order_id,request,header_payload,result)
  VALUES(co.id,actor.organization_id,sales.id,request,header,result);
  DELETE FROM techsafe_source.managed_mutation_context WHERE transaction_id=txid_current() AND change_order_id=co.id;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION techsafe_source.finalize_managed_change_order(uuid,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION techsafe_source.finalize_managed_change_order(uuid,uuid,text,text) TO authenticated;
CREATE FUNCTION public.finalize_managed_change_order(p_change_order_id uuid,p_approval_id uuid DEFAULT NULL,p_notes text DEFAULT NULL,p_portal_action text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
  SELECT techsafe_source.finalize_managed_change_order(p_change_order_id,p_approval_id,p_notes,p_portal_action);
$$;
REVOKE ALL ON FUNCTION public.finalize_managed_change_order(uuid,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finalize_managed_change_order(uuid,uuid,text,text) TO authenticated;

-- Prevent the old applier/restorer from separately mutating an opted-in order.
-- There are no managed registrations in existing flows until explicitly wired.
CREATE FUNCTION techsafe_source.require_legacy_order_path(p_co uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM techsafe_source.managed_change_orders managed JOIN public.change_orders co
    ON co.sales_order_id=managed.sales_order_id WHERE co.id=p_co) THEN
    RAISE EXCEPTION 'Managed order requires the atomic approval/amendment flow' USING ERRCODE='55000';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION techsafe_source.require_legacy_order_path(uuid) FROM PUBLIC,anon,authenticated;
DO $migration$
DECLARE name text; definition text; body text; marker text; pattern text:='\mBEGIN\M'; matches integer;
BEGIN
  FOREACH name IN ARRAY ARRAY['public.apply_change_order(uuid)','public.reject_change_order(uuid,text)'] LOOP
    SELECT pg_get_functiondef(oid),prosrc INTO definition,body FROM pg_proc WHERE oid=name::regprocedure;
    marker:='AS $function$'||body||'$function$';
    SELECT count(*) INTO matches FROM regexp_matches(body,pattern,'g');
    IF matches<1 OR position('techsafe_source.require_legacy_order_path' IN definition)>0
      OR position(marker IN definition)=0 OR NOT (SELECT prosecdef FROM pg_proc WHERE oid=name::regprocedure) THEN
      RAISE EXCEPTION 'Legacy change-order function changed; review managed-path guard';
    END IF;
    -- These inspected bodies have declarations followed by the outer BEGIN.
    -- Replace its first token within prosrc, not a greedy function-header span.
    EXECUTE replace(definition,marker,'AS $function$'||regexp_replace(body,pattern,
      E'\\&\nPERFORM techsafe_source.require_legacy_order_path(p_change_order_id);')||'$function$');
  END LOOP;
END;
$migration$;
