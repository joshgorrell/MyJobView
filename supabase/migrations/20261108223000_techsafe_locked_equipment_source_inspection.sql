-- Private, non-authorizing source-freshness inspection under row locks.
-- Requires explicit human migration review and real PostgreSQL concurrency tests.
-- Does not certify the equipment snapshot or enable Techsafe delivery.
CREATE OR REPLACE FUNCTION techsafe_source.inspect_locked_equipment_source(
 p_connection uuid, p_order uuid, p_generation bigint, p_revision bigint
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $$
DECLARE c techsafe_source.integration_connections%ROWTYPE;
        l techsafe_source.order_revision_ledger%ROWTYPE;
        scope jsonb;
BEGIN
 IF p_connection IS NULL OR p_order IS NULL OR p_generation IS NULL
    OR p_revision IS NULL OR p_generation<1 OR p_revision<1
 THEN RETURN jsonb_build_object('valid',false,'authorized',false,'snapshotReady',false,
   'reason','invalid_identity'); END IF;
 -- Lock connection before ledger in the same order as delivery authority.
 SELECT * INTO c FROM techsafe_source.integration_connections
 WHERE connection_id=p_connection AND sales_order_id=p_order FOR UPDATE;
 IF NOT FOUND OR c.enabled IS DISTINCT FROM true OR c.status IS DISTINCT FROM 'active'
    OR c.connection_generation IS DISTINCT FROM p_generation
 THEN RETURN jsonb_build_object('valid',false,'authorized',false,'snapshotReady',false,
   'reason','connection_not_active_or_generation_changed'); END IF;
 SELECT * INTO l FROM techsafe_source.order_revision_ledger
 WHERE connection_id=c.connection_id AND sales_order_id=c.sales_order_id FOR UPDATE;
 IF NOT FOUND OR l.organization_id IS DISTINCT FROM c.organization_id
    OR l.proposal_id IS DISTINCT FROM c.proposal_id
    OR l.connection_generation IS DISTINCT FROM c.connection_generation
    OR l.revision IS DISTINCT FROM p_revision
 THEN RETURN jsonb_build_object('valid',false,'authorized',false,'snapshotReady',false,
   'reason','ledger_revision_mismatch'); END IF;
 IF l.state IS DISTINCT FROM 'candidate' OR l.source_fingerprint IS NULL
    OR l.source_fingerprint !~ '^[0-9a-f]{64}$'
    OR l.source_fingerprint=repeat('0',64)
 THEN RETURN jsonb_build_object('valid',false,'authorized',false,'snapshotReady',false,
   'reason','ledger_held_or_fingerprint_missing'); END IF;
 scope:=techsafe_source.inspect_sales_order_equipment_scope(p_connection,p_order);
 IF scope->>'valid' IS DISTINCT FROM 'true'
 THEN RETURN jsonb_build_object('valid',false,'authorized',false,'snapshotReady',false,
   'reason','approved_sales_order_unverified'); END IF;
 IF (scope->>'unapproved_change_order_count')::bigint>0
    OR (scope->>'base_unmapped_count')::bigint>0
    OR (scope->>'unsupported_change_line_count')::bigint>0
    OR (scope->>'cross_tenant_change_line_count')::bigint>0
 THEN RETURN jsonb_build_object('valid',false,'authorized',false,'snapshotReady',false,
   'reason','equipment_scope_incomplete'); END IF;
 -- Even a clean read under locks is not an export certificate: the existing
 -- scope inspector deliberately does not certify complete equipment snapshots.
 RETURN jsonb_build_object('valid',true,'authorized',false,'snapshotReady',false,
   'reason','locked_scope_inspected_not_certified',
   'connection_id',c.connection_id,'sales_order_id',c.sales_order_id,
   'organization_id',c.organization_id,'approved_proposal_id',c.proposal_id,
   'connection_generation',c.connection_generation,'revision',l.revision,
   'base_line_count',scope->'base_line_count',
   'change_order_count',scope->'change_order_count',
   'approved_change_line_count',scope->'approved_change_line_count');
END $$;
REVOKE ALL ON FUNCTION techsafe_source.inspect_locked_equipment_source(uuid,uuid,bigint,bigint)
 FROM PUBLIC,anon,authenticated,service_role;
