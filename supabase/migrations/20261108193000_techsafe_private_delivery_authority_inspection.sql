-- Private, read-only verification of the actual MJV Sales Order connection and revision.
-- This is not a source export certificate. Until a separately persisted
-- scope-approved snapshot hash is bound to this ledger, delivery stays denied.
CREATE OR REPLACE FUNCTION techsafe_source.inspect_delivery_authority(
 p_connection uuid,p_order uuid,p_generation bigint,p_revision bigint
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $$
DECLARE c techsafe_source.integration_connections%ROWTYPE;
        l techsafe_source.order_revision_ledger%ROWTYPE;
        evidence jsonb; fingerprint text;
BEGIN
 IF p_connection IS NULL OR p_order IS NULL OR p_generation IS NULL
    OR p_revision IS NULL OR p_generation<1 OR p_revision<1
 THEN RETURN jsonb_build_object('authorized',false,'reason','invalid_identity'); END IF;
 SELECT * INTO c FROM techsafe_source.integration_connections
 WHERE connection_id=p_connection AND sales_order_id=p_order FOR UPDATE;
 IF NOT FOUND OR c.enabled IS DISTINCT FROM true OR c.status <> 'active'
    OR c.connection_generation IS DISTINCT FROM p_generation
 THEN RETURN jsonb_build_object('authorized',false,'reason','connection_not_active_or_generation_changed'); END IF;
 SELECT * INTO l FROM techsafe_source.order_revision_ledger
 WHERE connection_id=c.connection_id AND sales_order_id=c.sales_order_id FOR UPDATE;
 IF NOT FOUND OR l.organization_id IS DISTINCT FROM c.organization_id
    OR l.proposal_id IS DISTINCT FROM c.proposal_id
    OR l.connection_generation IS DISTINCT FROM c.connection_generation
    OR l.revision IS DISTINCT FROM p_revision
 THEN RETURN jsonb_build_object('authorized',false,'reason','ledger_revision_mismatch'); END IF;
 evidence:=techsafe_source.inspect_sales_order_source(p_connection,p_order);
 IF evidence->>'valid' IS DISTINCT FROM 'true'
    OR evidence->>'approved_proposal_id' IS DISTINCT FROM c.proposal_id::text
    OR evidence->>'organization_id' IS DISTINCT FROM c.organization_id::text
 THEN RETURN jsonb_build_object('authorized',false,'reason','approved_sales_order_unverified'); END IF;
 fingerprint:=encode(pg_catalog.sha256(pg_catalog.convert_to(
   jsonb_build_object('order',evidence->'sales_order',
     'proposal',evidence->'approved_proposal','equipment',evidence->'equipment')::text,'UTF8')),'hex');
 IF l.source_fingerprint IS NULL OR l.source_fingerprint IS DISTINCT FROM fingerprint
 THEN RETURN jsonb_build_object('authorized',false,'reason','source_changed_or_fingerprint_missing'); END IF;
 IF l.state IS DISTINCT FROM 'candidate'
 THEN RETURN jsonb_build_object('authorized',false,'reason','revision_not_candidate'); END IF;
 -- The current ledger does not yet bind an independently verified export snapshot
 -- and change-order scope to a signed event. Never issue a positive authorization.
 RETURN jsonb_build_object('authorized',false,'reason','snapshot_scope_certificate_not_implemented');
END $$;
REVOKE ALL ON FUNCTION techsafe_source.inspect_delivery_authority(uuid,uuid,bigint,bigint)
 FROM PUBLIC,anon,authenticated,service_role;
