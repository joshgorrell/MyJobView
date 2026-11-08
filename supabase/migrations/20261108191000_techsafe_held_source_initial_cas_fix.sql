CREATE OR REPLACE FUNCTION techsafe_source.refresh_held_source_fingerprint(
 p_connection uuid,p_order uuid,p_expected_revision bigint,p_expected_generation bigint
) RETURNS bigint
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $$
DECLARE c techsafe_source.integration_connections%ROWTYPE;
        evidence jsonb; fingerprint text;
BEGIN
 IF p_connection IS NULL OR p_order IS NULL THEN RETURN NULL; END IF;
 -- Serialize with connection pause/rebinding in this transaction.
 SELECT * INTO c FROM techsafe_source.integration_connections
 WHERE connection_id=p_connection AND sales_order_id=p_order FOR UPDATE;
 IF NOT FOUND OR c.enabled IS DISTINCT FROM true OR c.status <> 'active'
 THEN RETURN NULL; END IF;
 IF c.connection_generation IS DISTINCT FROM p_expected_generation THEN RETURN NULL; END IF;
 evidence:=techsafe_source.inspect_sales_order_source(p_connection,p_order);
 IF evidence->>'valid' IS DISTINCT FROM 'true'
   OR evidence->>'approved_proposal_id' IS DISTINCT FROM c.proposal_id::text
   OR evidence->>'organization_id' IS DISTINCT FROM c.organization_id::text
 THEN RETURN NULL; END IF;
 -- Exclude read_at and any authority/readiness flags. A fingerprint is not a signature.
 fingerprint:=encode(pg_catalog.sha256(pg_catalog.convert_to(
  (jsonb_build_object('order',evidence->'sales_order',
                      'proposal',evidence->'approved_proposal',
                      'equipment',evidence->'equipment'))::text,'UTF8')),'hex');
 RETURN techsafe_source.cas_order_revision(
  c.connection_id,c.sales_order_id,c.organization_id,c.proposal_id,
  p_expected_revision,CASE WHEN p_expected_revision IS NULL THEN NULL ELSE p_expected_generation END,c.connection_generation,
  fingerprint,'held','awaiting_independent_source_authority');
END $$;
