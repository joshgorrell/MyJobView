-- Read-only equipment scope diagnostics for an existing approved MJV Sales Order.
-- The linked proposal is internal storage; never export unapproved proposals.
-- This is NOT an export certificate and cannot authorize delivery.
CREATE OR REPLACE FUNCTION techsafe_source.inspect_sales_order_equipment_scope(
 p_connection uuid,p_order uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE evidence jsonb; c techsafe_source.integration_connections%ROWTYPE;
        base_count bigint; base_unmapped bigint;
        changes_count bigint; pending_count bigint; unsupported_count bigint;
        approved_count bigint; approved_line_count bigint;
BEGIN
 evidence:=techsafe_source.inspect_sales_order_source(p_connection,p_order);
 IF evidence->>'valid' IS DISTINCT FROM 'true'
 THEN RETURN jsonb_build_object('valid',false,'reason','approved_sales_order_unverified',
  'scopeVerified',false,'snapshotReady',false); END IF;
 SELECT * INTO c FROM techsafe_source.integration_connections
 WHERE connection_id=p_connection AND sales_order_id=p_order
   AND enabled=true AND status='active';
 IF NOT FOUND THEN RETURN jsonb_build_object('valid',false,'reason','connection_not_active',
  'scopeVerified',false,'snapshotReady',false); END IF;
 SELECT count(*),count(*) FILTER (WHERE product_id IS NULL OR
   quantity IS NULL OR quantity<0 OR quantity<>trunc(quantity) OR quantity>10000)
 INTO base_count,base_unmapped FROM public.proposal_line_items
 WHERE proposal_id=c.proposal_id AND organization_id=c.organization_id;
 SELECT count(*),count(*) FILTER (WHERE status IS DISTINCT FROM 'approved'
   OR (requires_customer_approval=true AND customer_approved IS DISTINCT FROM true)),
   count(*) FILTER (WHERE status='approved' AND
     (requires_customer_approval IS DISTINCT FROM true OR customer_approved=true))
 INTO changes_count,pending_count,approved_count
 FROM public.change_orders
 WHERE sales_order_id=c.sales_order_id AND organization_id=c.organization_id;
 SELECT count(*),count(*) FILTER (WHERE
   li.action_type NOT IN ('add','remove','modify') OR li.action_type IS NULL
   OR (li.action_type IN ('remove','modify') AND li.proposal_line_item_id IS NULL)
   OR (li.action_type='add' AND li.product_id IS NULL)
   OR (li.action_type='add' AND (li.new_quantity IS NULL OR li.new_quantity<0
     OR li.new_quantity<>trunc(li.new_quantity) OR li.new_quantity>10000)))
 INTO approved_line_count,unsupported_count
 FROM public.change_order_line_items li
 JOIN public.change_orders co ON co.id=li.change_order_id
 WHERE co.sales_order_id=c.sales_order_id AND co.organization_id=c.organization_id
   AND co.status='approved'
   AND (co.requires_customer_approval IS DISTINCT FROM true OR co.customer_approved=true)
   AND li.organization_id=c.organization_id;
 RETURN jsonb_build_object(
  'valid',true,'connection_id',c.connection_id,'organization_id',c.organization_id,
  'sales_order_id',c.sales_order_id,'approved_proposal_id',c.proposal_id,
  'connection_generation',c.connection_generation,
  'base_line_count',base_count,'base_unmapped_count',base_unmapped,
  'change_order_count',changes_count,'unapproved_change_order_count',pending_count,
  'approved_change_order_count',approved_count,'approved_change_line_count',approved_line_count,
  'unsupported_change_line_count',unsupported_count,
  'requires_change_reconciliation',changes_count>0,
  'scopeVerified',false,'snapshotReady',false,
  'reason',CASE WHEN pending_count>0 THEN 'unapproved_changes_present'
    WHEN base_unmapped>0 THEN 'base_product_mapping_incomplete'
    WHEN unsupported_count>0 THEN 'change_line_mapping_incomplete'
    ELSE 'approved_scope_reconciliation_not_certified' END);
END $$;
REVOKE ALL ON FUNCTION techsafe_source.inspect_sales_order_equipment_scope(uuid,uuid)
 FROM PUBLIC,anon,authenticated,service_role;
