-- Removal evidence is separate from presentation is_hidden. No legacy receipt
-- is inferred from approved status or hidden flags; uncertain history stays so.
CREATE TABLE techsafe_source.applied_removals (
  change_order_line_item_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  sales_order_id uuid NOT NULL,
  proposal_id uuid NOT NULL,
  change_order_id uuid NOT NULL,
  proposal_line_item_id uuid NOT NULL,
  source_payload jsonb NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  restored_at timestamptz
);
CREATE INDEX applied_removals_order_line_idx ON techsafe_source.applied_removals(sales_order_id,proposal_line_item_id);
ALTER TABLE techsafe_source.applied_removals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE techsafe_source.applied_removals FROM PUBLIC,anon,authenticated;

-- Invoker helpers run under the existing approved-change function owner. They
-- have no browser execute grant and validate every source relationship.
CREATE FUNCTION techsafe_source.record_scope_removal(p_co uuid,p_co_line uuid,p_line uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE source record; prior techsafe_source.applied_removals%ROWTYPE;
BEGIN
  SELECT co.organization_id,co.sales_order_id,so.proposal_id,to_jsonb(item) AS payload
  INTO source FROM public.change_orders co
  JOIN public.sales_orders so ON so.id=co.sales_order_id AND so.organization_id=co.organization_id
  JOIN public.proposals proposal ON proposal.id=so.proposal_id AND proposal.organization_id=co.organization_id
  JOIN public.change_order_line_items item ON item.change_order_id=co.id AND item.organization_id=co.organization_id
  JOIN public.proposal_line_items line ON line.id=item.proposal_line_item_id
    AND line.proposal_id=so.proposal_id AND line.organization_id=co.organization_id
  WHERE co.id=p_co AND co.status='approved' AND item.id=p_co_line
    AND item.action_type='remove' AND line.id=p_line;
  IF NOT FOUND THEN RAISE EXCEPTION 'Removal source does not match approved order scope' USING ERRCODE='42501'; END IF;
  IF auth.uid() IS NULL THEN
    IF current_setting('role',true) IN ('anon','authenticated') OR coalesce(current_setting('request.jwt.claim.role',true),'') IN ('anon','authenticated') THEN
      RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
    END IF;
  ELSIF NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.organization_id=source.organization_id AND p.is_active IS TRUE) THEN
    RAISE EXCEPTION 'Active user in the order organization required' USING ERRCODE='42501';
  END IF;
  SELECT * INTO prior FROM techsafe_source.applied_removals WHERE change_order_line_item_id=p_co_line FOR UPDATE;
  IF FOUND AND (prior.organization_id IS DISTINCT FROM source.organization_id OR prior.sales_order_id IS DISTINCT FROM source.sales_order_id
    OR prior.proposal_id IS DISTINCT FROM source.proposal_id OR prior.proposal_line_item_id IS DISTINCT FROM p_line OR prior.change_order_id IS DISTINCT FROM p_co) THEN
    RAISE EXCEPTION 'Removal identity changed; review source scope' USING ERRCODE='22023';
  END IF;
  INSERT INTO techsafe_source.applied_removals(change_order_line_item_id,organization_id,sales_order_id,proposal_id,change_order_id,proposal_line_item_id,source_payload)
  VALUES(p_co_line,source.organization_id,source.sales_order_id,source.proposal_id,p_co,p_line,source.payload)
  ON CONFLICT(change_order_line_item_id) DO UPDATE SET source_payload=EXCLUDED.source_payload,applied_at=now(),restored_at=NULL;
END;
$$;
REVOKE ALL ON FUNCTION techsafe_source.record_scope_removal(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION techsafe_source.record_scope_restoration(p_co uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE source public.change_orders%ROWTYPE;
BEGIN
  SELECT co.* INTO source FROM public.change_orders co
    JOIN public.sales_orders so ON so.id=co.sales_order_id AND so.organization_id=co.organization_id
    JOIN public.proposals proposal ON proposal.id=so.proposal_id AND proposal.organization_id=co.organization_id
    WHERE co.id=p_co AND co.status='rejected';
  IF NOT FOUND THEN RAISE EXCEPTION 'Rejected change order required' USING ERRCODE='42501'; END IF;
  IF auth.uid() IS NULL THEN
    IF current_setting('role',true) IN ('anon','authenticated') OR coalesce(current_setting('request.jwt.claim.role',true),'') IN ('anon','authenticated') THEN
      RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
    END IF;
  ELSIF NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.organization_id=source.organization_id AND p.is_active IS TRUE) THEN
    RAISE EXCEPTION 'Active user in the order organization required' USING ERRCODE='42501';
  END IF;
  IF EXISTS(SELECT 1 FROM public.change_order_line_items item
    LEFT JOIN public.proposal_line_items line ON line.id=item.proposal_line_item_id
    JOIN public.sales_orders so ON so.id=source.sales_order_id
    WHERE item.change_order_id=p_co AND item.action_type='remove'
      AND (item.organization_id IS DISTINCT FROM source.organization_id OR line.organization_id IS DISTINCT FROM source.organization_id
        OR line.proposal_id IS DISTINCT FROM so.proposal_id)) THEN
    RAISE EXCEPTION 'Restoration source does not match order scope' USING ERRCODE='42501';
  END IF;
  IF EXISTS(SELECT 1 FROM techsafe_source.applied_removals receipt
    WHERE receipt.change_order_id=p_co AND NOT EXISTS(
      SELECT 1 FROM public.change_order_line_items item
      WHERE item.id=receipt.change_order_line_item_id AND item.change_order_id=p_co
        AND item.organization_id=receipt.organization_id AND item.action_type='remove'
        AND item.proposal_line_item_id=receipt.proposal_line_item_id)) THEN
    RAISE EXCEPTION 'Applied removal identity changed; review restoration' USING ERRCODE='22023';
  END IF;
  -- Only certify rows actually targeted by the existing restoration statement.
  UPDATE techsafe_source.applied_removals receipt SET restored_at=now()
  FROM public.change_order_line_items item
  WHERE receipt.change_order_id=p_co AND receipt.organization_id=source.organization_id
    AND item.id=receipt.change_order_line_item_id AND item.change_order_id=p_co
    AND item.organization_id=source.organization_id AND item.action_type='remove'
    AND item.proposal_line_item_id=receipt.proposal_line_item_id;
END;
$$;
REVOKE ALL ON FUNCTION techsafe_source.record_scope_restoration(uuid) FROM PUBLIC,anon,authenticated;

-- Membership evidence only, not proof that all quantities/prices or an entire
-- order revision are committed. The later exporter must verify those separately.
CREATE FUNCTION techsafe_source.order_line_membership(p_order uuid,p_line uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE parent record;
BEGIN
  SELECT so.organization_id,so.proposal_id INTO parent FROM public.sales_orders so
  JOIN public.proposal_line_items line ON line.proposal_id=so.proposal_id AND line.organization_id=so.organization_id
  WHERE so.id=p_order AND line.id=p_line;
  IF NOT FOUND THEN RETURN 'unverified'; END IF;
  -- Rejection can unhide a row removed by another CO in the legacy workflow.
  -- Conflicting recorded actions must not be presented as a verified quote.
  IF EXISTS(SELECT 1 FROM techsafe_source.applied_removals restored
    JOIN techsafe_source.applied_removals active ON active.sales_order_id=restored.sales_order_id
      AND active.proposal_line_item_id=restored.proposal_line_item_id
    WHERE restored.sales_order_id=p_order AND restored.proposal_line_item_id=p_line
      AND restored.restored_at IS NOT NULL AND active.restored_at IS NULL
      AND restored.restored_at>=active.applied_at) THEN RETURN 'unverified'; END IF;
  -- An unrestored receipt whose source was unlocked/edited/deleted is uncertain.
  IF EXISTS(SELECT 1 FROM techsafe_source.applied_removals r
    LEFT JOIN public.change_orders co ON co.id=r.change_order_id
    LEFT JOIN public.change_order_line_items item ON item.id=r.change_order_line_item_id
    WHERE r.sales_order_id=p_order AND r.proposal_line_item_id=p_line AND r.restored_at IS NULL
      AND (r.organization_id IS DISTINCT FROM parent.organization_id OR r.proposal_id IS DISTINCT FROM parent.proposal_id
        OR co.status IS DISTINCT FROM 'approved' OR co.organization_id IS DISTINCT FROM r.organization_id
        OR co.sales_order_id IS DISTINCT FROM p_order OR to_jsonb(item) IS DISTINCT FROM r.source_payload)) THEN RETURN 'unverified'; END IF;
  -- Approved is not enough: a matching successful application receipt is needed.
  IF EXISTS(SELECT 1 FROM public.change_order_line_items item JOIN public.change_orders co ON co.id=item.change_order_id
    WHERE co.sales_order_id=p_order AND co.organization_id=parent.organization_id AND co.status='approved'
      AND item.proposal_line_item_id=p_line AND item.action_type='remove'
      AND NOT EXISTS(SELECT 1 FROM techsafe_source.applied_removals r WHERE r.change_order_line_item_id=item.id
        AND r.organization_id=parent.organization_id AND r.sales_order_id=p_order AND r.proposal_line_item_id=p_line
        AND r.restored_at IS NULL AND r.source_payload=to_jsonb(item))) THEN RETURN 'unverified'; END IF;
  IF EXISTS(SELECT 1 FROM techsafe_source.applied_removals r WHERE r.sales_order_id=p_order AND r.proposal_line_item_id=p_line
    AND r.organization_id=parent.organization_id AND r.restored_at IS NULL) THEN RETURN 'removed'; END IF;
  RETURN 'included';
END;
$$;
REVOKE ALL ON FUNCTION techsafe_source.order_line_membership(uuid,uuid) FROM PUBLIC,anon,authenticated;

-- Preserve established calculations and presentation behavior. Insert receipts
-- at the exact successful application/restoration points. Refuse schema drift.
DO $migration$
DECLARE definition text; pattern text; matches integer;
BEGIN
  IF NOT (SELECT bool_and(prosecdef) FROM pg_proc WHERE oid IN
    ('public.apply_change_order(uuid)'::regprocedure,'public.reject_change_order(uuid,text)'::regprocedure)) THEN
    RAISE EXCEPTION 'Change-order execution model changed; review receipt permissions';
  END IF;
  SELECT pg_get_functiondef('public.apply_change_order(uuid)'::regprocedure) INTO definition;
  pattern:='(?s)(IF[[:space:]]+v_item[.]action_type[[:space:]]*=[[:space:]]*''remove''[[:space:]]+THEN.*?)(ELSIF[[:space:]]+v_item[.]action_type[[:space:]]*=[[:space:]]*''add''[[:space:]]+THEN)';
  SELECT count(*) INTO matches FROM regexp_matches(definition,pattern,'g');
  IF matches<>1 OR position('techsafe_source.record_scope_removal' IN definition)>0 THEN RAISE EXCEPTION 'apply_change_order changed; review removal receipt integration'; END IF;
  EXECUTE regexp_replace(definition,pattern,E'\\1\nPERFORM techsafe_source.record_scope_removal(v_co.id,v_item.id,v_item.proposal_line_item_id);\n\\2');
  SELECT pg_get_functiondef('public.reject_change_order(uuid,text)'::regprocedure) INTO definition;
  pattern:='updated_at[[:space:]]*=[[:space:]]*now\(\)[[:space:]]*WHERE[[:space:]]+id[[:space:]]*=[[:space:]]*p_change_order_id;';
  SELECT count(*) INTO matches FROM regexp_matches(definition,pattern,'g');
  IF matches<>1 OR position('techsafe_source.record_scope_restoration' IN definition)>0 THEN RAISE EXCEPTION 'reject_change_order changed; review restoration receipt integration'; END IF;
  EXECUTE regexp_replace(definition,pattern,E'\\&\nPERFORM techsafe_source.record_scope_restoration(p_change_order_id);');
END;
$migration$;
