-- Read-only, private source evidence for an EXISTING MJV Sales Order.
-- The linked proposal is an internal product-list FK, not a standalone source.
-- This is NOT a sender, approval certificate, revision promotion or checkout gate.
CREATE FUNCTION techsafe_source.inspect_sales_order_source(
 p_connection uuid, p_sales_order uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE c techsafe_source.integration_connections%ROWTYPE;
        o public.sales_orders%ROWTYPE;
        p public.proposals%ROWTYPE;
        lines jsonb;
BEGIN
 SELECT * INTO c FROM techsafe_source.integration_connections
  WHERE connection_id=p_connection AND sales_order_id=p_sales_order;
 IF NOT FOUND OR c.enabled IS DISTINCT FROM true OR c.status <> 'active'
 THEN RETURN jsonb_build_object('valid',false,'reason','connection_not_active'); END IF;
 SELECT * INTO o FROM public.sales_orders WHERE id=c.sales_order_id
  AND organization_id=c.organization_id AND proposal_id=c.proposal_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('valid',false,'reason','sales_order_binding_missing'); END IF;
 SELECT * INTO p FROM public.proposals WHERE id=o.proposal_id
  AND organization_id=o.organization_id AND approved_at IS NOT NULL;
 IF NOT FOUND THEN RETURN jsonb_build_object('valid',false,'reason','linked_proposal_not_approved'); END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(li) ORDER BY li.id), '[]'::jsonb)
 INTO lines FROM public.proposal_line_items li
 WHERE li.proposal_id=o.proposal_id AND li.organization_id=o.organization_id;
 RETURN jsonb_build_object(
  'valid',true,'connection_id',c.connection_id,
  'connection_generation',c.connection_generation,
  'organization_id',o.organization_id,'sales_order_id',o.id,
  'approved_proposal_id',o.proposal_id,'read_at',clock_timestamp(),
  'sales_order',to_jsonb(o),'approved_proposal',to_jsonb(p),
  'equipment',lines,
  'scopeVerified',false,'snapshotReady',false,'quoteReady',false);
END $$;
REVOKE ALL ON FUNCTION techsafe_source.inspect_sales_order_source(uuid,uuid)
 FROM PUBLIC,anon,authenticated,service_role;
-- No grants or automatic dispatch.
