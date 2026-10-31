-- Integration-owned metadata only. No source business function/trigger change.
DO $guard$
DECLARE signature text; expected text; actual text;
BEGIN
 FOR signature,expected IN SELECT * FROM (VALUES
  ('techsafe_source.try_begin_application_observation(uuid)','da7934494f8fc1c39302b85a85ae0c0376e032e948977672b9ab5b3e77a408ad'),
  ('techsafe_source.try_finish_application_observation(uuid,uuid)','f42fb3b66283981be363bf073fb23602651538c8e303d4cf602199c1566ef9f4')) AS expected(signature,hash)
 LOOP
  SELECT encode(sha256(convert_to(btrim(regexp_replace(p.prosrc,'[[:space:]]+',' ','g')),'UTF8')),'hex') INTO actual
  FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang
  WHERE p.oid=to_regprocedure(signature) AND NOT p.prosecdef AND NOT p.proretset AND p.prokind='f' AND p.provolatile='v'
   AND p.prorettype='uuid'::regtype AND l.lanname='plpgsql' AND pg_get_userbyid(p.proowner)='postgres'
   AND p.proconfig=ARRAY['search_path=""']::text[];
  IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Review changed bounded observation helper: %',signature; END IF;
 END LOOP;
END;
$guard$;

ALTER TABLE techsafe_source.application_observations
 ADD COLUMN equipment_before_fact_bytes integer CHECK(equipment_before_fact_bytes IS NULL OR
  (equipment_before_facts IS NOT NULL AND equipment_before_fact_bytes BETWEEN 2 AND 1048576 AND equipment_before_fact_bytes=octet_length(equipment_before_facts::text))),
 ADD COLUMN equipment_after_fact_bytes integer CHECK(equipment_after_fact_bytes IS NULL OR
  (equipment_after_facts IS NOT NULL AND equipment_after_fact_bytes BETWEEN 2 AND 1048576 AND equipment_after_fact_bytes=octet_length(equipment_after_facts::text)));
-- Nullable metadata: no old evidence backfill/replay or proof promotion.

CREATE OR REPLACE FUNCTION techsafe_source.try_begin_application_observation(p_co uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE observed jsonb; equipment jsonb; input_hash text; identity uuid; facts jsonb; evidence jsonb;
BEGIN
 observed:=techsafe_source.application_read_set(p_co);
 IF observed IS NULL THEN RETURN NULL; END IF;
 equipment:=techsafe_source.read_order_equipment_source((observed->>'connectionId')::uuid,(observed->>'orderId')::uuid);
 SELECT item->>'inputHash' INTO input_hash FROM jsonb_array_elements(equipment->'equipmentEvidence'->'inputs') item WHERE item->>'changeOrderId'=p_co::text;
 IF equipment IS NULL OR input_hash IS NULL THEN RETURN NULL; END IF;
 facts:=techsafe_source.equipment_application_facts(equipment,p_co);
 evidence:=techsafe_source.equipment_facts_evidence(facts);
 IF evidence IS NULL OR evidence->'inputs'->0->>'inputHash' IS DISTINCT FROM input_hash
  OR evidence->>'scopeHash' IS DISTINCT FROM equipment->'equipmentEvidence'->>'scopeHash' THEN RETURN NULL; END IF;
 INSERT INTO techsafe_source.application_observations(organization_id,connection_id,sales_order_id,proposal_id,change_order_id,
  source_hash,before_scope_hash,transaction_id,actor_id,equipment_input_hash,equipment_started_order,
  equipment_before_scope_hash,equipment_before_facts,equipment_before_fact_bytes)
 VALUES((observed->>'organizationId')::uuid,(observed->>'connectionId')::uuid,(observed->>'orderId')::uuid,(observed->>'proposalId')::uuid,p_co,
  observed->>'sourceHash',observed->>'scopeHash',txid_current(),auth.uid(),input_hash,nextval('techsafe_source.equipment_observation_order_seq'),
  evidence->>'scopeHash',facts,octet_length(facts::text))
 RETURNING id INTO identity;
 RETURN identity;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION techsafe_source.try_begin_application_observation(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION techsafe_source.try_finish_application_observation(p_co uuid,p_observation uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE observed jsonb; equipment jsonb; input_hash text; identity uuid; facts jsonb; evidence jsonb;
BEGIN
 IF p_observation IS NULL THEN RETURN NULL; END IF;
 observed:=techsafe_source.application_read_set(p_co);
 IF observed IS NULL THEN RETURN NULL; END IF;
 equipment:=techsafe_source.read_order_equipment_source((observed->>'connectionId')::uuid,(observed->>'orderId')::uuid);
 SELECT item->>'inputHash' INTO input_hash FROM jsonb_array_elements(equipment->'equipmentEvidence'->'inputs') item WHERE item->>'changeOrderId'=p_co::text;
 IF equipment IS NULL OR input_hash IS NULL THEN RETURN NULL; END IF;
 facts:=techsafe_source.equipment_application_facts(equipment,p_co);
 evidence:=techsafe_source.equipment_facts_evidence(facts);
 IF evidence IS NULL OR evidence->'inputs'->0->>'inputHash' IS DISTINCT FROM input_hash
  OR evidence->>'scopeHash' IS DISTINCT FROM equipment->'equipmentEvidence'->>'scopeHash' THEN RETURN NULL; END IF;
 UPDATE techsafe_source.application_observations SET after_scope_hash=observed->>'scopeHash',completed_at=clock_timestamp(),
  equipment_after_scope_hash=evidence->>'scopeHash',equipment_after_facts=facts,equipment_after_fact_bytes=octet_length(facts::text),
  equipment_completed_order=nextval('techsafe_source.equipment_observation_order_seq')
 WHERE id=p_observation AND change_order_id=p_co AND transaction_id=txid_current()
  AND actor_id IS NOT DISTINCT FROM auth.uid() AND completed_at IS NULL
  AND organization_id=(observed->>'organizationId')::uuid AND connection_id=(observed->>'connectionId')::uuid
  AND sales_order_id=(observed->>'orderId')::uuid AND proposal_id=(observed->>'proposalId')::uuid
  AND source_hash=observed->>'sourceHash' AND equipment_input_hash=input_hash
  AND equipment_before_facts->'binding'=facts->'binding'
  AND techsafe_source.equipment_facts_evidence(equipment_before_facts)->>'scopeHash'=equipment_before_scope_hash
  AND techsafe_source.equipment_facts_evidence(equipment_before_facts)->'inputs'->0->>'inputHash'=input_hash
 RETURNING id INTO identity;
 RETURN identity;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION techsafe_source.try_finish_application_observation(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- One read-only statement snapshot. Gate on small stored budget metadata before
-- loading/rehashing history facts; do not reread the whole order for each pair.
CREATE FUNCTION techsafe_source.read_draft_candidate_inputs(p_connection uuid,p_order uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
WITH source AS MATERIALIZED (
 SELECT techsafe_source.read_order_selling_price_facts(p_connection,p_order) AS body
), basis AS MATERIALIZED (
 SELECT techsafe_source.read_portal_approval_equipment_basis(p_connection,p_order) AS body
 FROM source s WHERE s.body IS NOT NULL
), metadata AS MATERIALIZED (
 SELECT o.id,o.completed_at,o.equipment_started_order,o.equipment_completed_order,
  o.equipment_before_fact_bytes,o.equipment_after_fact_bytes
 FROM techsafe_source.application_observations o JOIN source s ON s.body IS NOT NULL
  AND o.organization_id::text=s.body->>'organizationId' AND o.proposal_id::text=s.body->'order'->>'proposal_id'
 WHERE o.connection_id=p_connection AND o.sales_order_id=p_order ORDER BY o.id LIMIT 1001
), budget AS MATERIALIZED (
 SELECT count(*) AS n,coalesce(sum(equipment_before_fact_bytes::bigint+equipment_after_fact_bytes+2048),0) AS bytes
 FROM metadata
), allowed AS MATERIALIZED (
 SELECT s.body AS model,b.body AS basis FROM source s CROSS JOIN basis b CROSS JOIN budget n
 WHERE s.body IS NOT NULL AND b.body IS NOT NULL AND n.n<=1000
  AND n.n=jsonb_array_length(s.body->'observations')
  AND NOT EXISTS(SELECT 1 FROM metadata WHERE completed_at IS NULL OR equipment_before_fact_bytes IS NULL OR equipment_after_fact_bytes IS NULL
   OR equipment_started_order IS NULL OR equipment_completed_order IS NULL OR equipment_completed_order<=equipment_started_order)
  AND octet_length(s.body::text)+octet_length(b.body::text)+n.bytes+1024<=8388608
), facts AS MATERIALIZED (
 SELECT o.*,jsonb_build_object('connectionId',o.connection_id,'organizationId',o.organization_id,
  'orderId',o.sales_order_id,'proposalId',o.proposal_id,'changeOrderId',o.change_order_id) AS binding,
  techsafe_source.equipment_facts_evidence(o.equipment_before_facts) AS before_evidence,
  techsafe_source.equipment_facts_evidence(o.equipment_after_facts) AS after_evidence
 FROM allowed a CROSS JOIN metadata m JOIN techsafe_source.application_observations o ON o.id=m.id
), pairs AS MATERIALIZED (
 SELECT id,equipment_started_order,CASE WHEN equipment_before_facts->'binding'=binding AND equipment_after_facts->'binding'=binding
  AND before_evidence->>'scopeHash'=equipment_before_scope_hash AND after_evidence->>'scopeHash'=equipment_after_scope_hash
  AND before_evidence->'inputs'->0->>'inputHash'=equipment_input_hash AND after_evidence->'inputs'->0->>'inputHash'=equipment_input_hash THEN
  jsonb_build_object('pairVersion',1,'observationId',id,'transactionId',transaction_id::text,'binding',binding,
   'startedOrder',equipment_started_order::text,'completedOrder',equipment_completed_order::text,
   'equipmentInputHash',equipment_input_hash,'beforeScopeHash',equipment_before_scope_hash,'afterScopeHash',equipment_after_scope_hash,
   'changeOrder',equipment_before_facts->'changeOrder','changeLines',equipment_before_facts->'changeLines',
   'beforeLines',equipment_before_facts->'lines','afterLines',equipment_after_facts->'lines',
   'scopeVerified',false,'snapshotReady',false,'quoteReady',false) END AS body
 FROM facts
), content AS (
 SELECT jsonb_build_object('bundleVersion',1,'currentModel',model,'basis',basis,
  'pairs',coalesce((SELECT jsonb_agg(body ORDER BY equipment_started_order,id) FROM pairs),'[]'::jsonb),
  'scopeVerified',false,'snapshotReady',false,'quoteReady',false) AS body FROM allowed
 WHERE NOT EXISTS(SELECT 1 FROM pairs WHERE body IS NULL)
  AND jsonb_array_length(model->'lines')+jsonb_array_length(basis->'lines')
   +coalesce((SELECT sum(jsonb_array_length(body->'beforeLines')+jsonb_array_length(body->'afterLines')+jsonb_array_length(body->'changeLines')) FROM pairs),0)<=100000
), envelope AS (
 SELECT body||jsonb_build_object('inputFingerprint',encode(sha256(convert_to(body::text,'UTF8')),'hex'),
  'readAtEpoch',extract(epoch FROM statement_timestamp())::text) AS body FROM content
)
SELECT body FROM envelope WHERE octet_length(body::text)<=8388608;
$$;
REVOKE ALL ON FUNCTION techsafe_source.read_draft_candidate_inputs(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

