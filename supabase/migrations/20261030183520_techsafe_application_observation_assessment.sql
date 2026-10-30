-- Read-only internal diagnostic. No caller, source hook or quote is enabled.
CREATE FUNCTION techsafe_source.assess_application_observation(p_co uuid,p_observation uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE current_set jsonb; observed techsafe_source.application_observations%ROWTYPE; state text;
BEGIN
  -- Read source authorization/binding before looking up private evidence.
  current_set:=techsafe_source.application_read_set(p_co);
  IF current_set IS NULL THEN
    RETURN jsonb_build_object('state','source_unavailable','quoteReady',false);
  END IF;
  SELECT * INTO observed FROM techsafe_source.application_observations WHERE id=p_observation;
  IF NOT FOUND THEN state:='missing_observation';
  ELSIF observed.change_order_id IS DISTINCT FROM p_co
    OR observed.organization_id IS DISTINCT FROM (current_set->>'organizationId')::uuid
    OR observed.connection_id IS DISTINCT FROM (current_set->>'connectionId')::uuid
    OR observed.sales_order_id IS DISTINCT FROM (current_set->>'orderId')::uuid
    OR observed.proposal_id IS DISTINCT FROM (current_set->>'proposalId')::uuid THEN
    state:='binding_mismatch';
  ELSIF observed.completed_at IS NULL OR observed.after_scope_hash IS NULL THEN
    state:='incomplete_observation';
  ELSIF observed.source_hash IS DISTINCT FROM current_set->>'sourceHash' THEN
    state:='source_changed';
  ELSIF observed.after_scope_hash IS DISTINCT FROM current_set->>'scopeHash' THEN
    state:='scope_changed';
  ELSE state:='matches_current_read_set';
  END IF;
  -- Matching hashes are not historical/application-semantic proof and do not
  -- include all customer/catalog/config/freshness inputs needed for a quote.
  RETURN jsonb_build_object('state',state,'quoteReady',false);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('state','read_error','quoteReady',false);
END;
$$;
REVOKE ALL ON FUNCTION techsafe_source.assess_application_observation(uuid,uuid) FROM PUBLIC,anon,authenticated;
-- No public wrapper, grant to a worker, policy, source mutation or receipt write.
