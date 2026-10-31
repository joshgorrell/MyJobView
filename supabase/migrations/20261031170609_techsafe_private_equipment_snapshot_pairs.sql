-- Private bounded observation facts only; no source workflow or control changes.
DO $guard$
DECLARE signature text; expected text; actual text;
BEGIN
 FOR signature,expected IN SELECT * FROM (VALUES
  ('techsafe_source.try_begin_application_observation(uuid)','34d7242e5e99702a4929ce1469e4e1cf09f4d7eb61ed349e64182c495db37f6d'),
  ('techsafe_source.try_finish_application_observation(uuid,uuid)','f0c963bb0cd3043dbbc23f56d81a2254ed5fbb22cc3f20af9e80e02d7d54af4b')) AS expected(signature,hash)
 LOOP
  SELECT encode(sha256(convert_to(btrim(regexp_replace(p.prosrc,'[[:space:]]+',' ','g')),'UTF8')),'hex') INTO actual
  FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang
  WHERE p.oid=to_regprocedure(signature) AND NOT p.prosecdef AND NOT p.proretset AND p.prokind='f' AND p.provolatile='v'
   AND p.prorettype='uuid'::regtype AND l.lanname='plpgsql' AND pg_get_userbyid(p.proowner)='postgres'
   AND p.proconfig=ARRAY['search_path=""']::text[];
  IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Review changed equipment observation helper: %',signature; END IF;
 END LOOP;
END;
$guard$;

ALTER TABLE techsafe_source.application_observations
 ADD COLUMN equipment_before_scope_hash text CHECK(equipment_before_scope_hash ~ '^[a-f0-9]{64}$'),
 ADD COLUMN equipment_before_facts jsonb CHECK(jsonb_typeof(equipment_before_facts)='object' AND octet_length(equipment_before_facts::text)<=1048576),
 ADD COLUMN equipment_after_facts jsonb CHECK(jsonb_typeof(equipment_after_facts)='object' AND octet_length(equipment_after_facts::text)<=1048576),
 ADD CONSTRAINT equipment_before_facts_presence CHECK((equipment_before_facts IS NULL)=(equipment_before_scope_hash IS NULL)),
 ADD CONSTRAINT equipment_after_facts_presence CHECK(equipment_after_facts IS NULL OR equipment_before_facts IS NOT NULL),
 ADD CONSTRAINT equipment_facts_completion CHECK(equipment_before_facts IS NULL OR ((completed_at IS NULL)=(equipment_after_facts IS NULL)));
-- Legacy facts remain NULL. No backfill, replay, browser/API grants or new table.
REVOKE ALL ON TABLE techsafe_source.application_observations FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION techsafe_source.equipment_application_facts(p_model jsonb,p_co uuid)
RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
WITH source AS MATERIALIZED (
 SELECT p_model AS body WHERE p_model->>'readModelVersion'='1'
  AND jsonb_typeof(p_model->'lines')='array' AND jsonb_typeof(p_model->'changeOrders')='array'
  AND jsonb_typeof(p_model->'changeLines')='array'
), content AS (
 SELECT jsonb_build_object('factsVersion',1,'binding',jsonb_build_object('connectionId',body->'connectionId',
  'organizationId',body->'organizationId','orderId',body->'order'->'id','proposalId',body->'order'->'proposal_id','changeOrderId',p_co),
  'changeOrder',jsonb_build_object('id',change->'id','organization_id',change->'organization_id',
   'sales_order_id',change->'sales_order_id','proposal_id',change->'proposal_id','status',change->'status'),
  'changeLines',coalesce((SELECT jsonb_agg(jsonb_build_object('id',item->'id','organization_id',item->'organization_id',
   'change_order_id',item->'change_order_id','action_type',item->'action_type','proposal_line_item_id',item->'proposal_line_item_id',
   'product_id',item->'product_id','product_name',item->'product_name','product_description',item->'product_description',
   'item_type',item->'item_type','new_quantity',item->'new_quantity','new_unit_price',item->'new_unit_price','remove_scope',item->'remove_scope',
   'sort_order',item->'sort_order','created_at',item->'created_at') ORDER BY item->>'id')
   FROM jsonb_array_elements(body->'changeLines') item WHERE item->>'change_order_id'=p_co::text),'[]'::jsonb),
  'lines',coalesce((SELECT jsonb_agg(jsonb_build_object('line',jsonb_build_object('id',line->'line'->'id',
   'organization_id',line->'line'->'organization_id','proposal_id',line->'line'->'proposal_id','product_id',line->'line'->'product_id',
   'item_type',line->'line'->'item_type','quantity',line->'line'->'quantity','is_customer_supplied',line->'line'->'is_customer_supplied',
   'description',line->'line'->'description','is_hidden',line->'line'->'is_hidden'),'unitSalePrice',line->'unitSalePrice') ORDER BY line->'line'->>'id')
   FROM jsonb_array_elements(body->'lines') line),'[]'::jsonb)) AS facts
 FROM source CROSS JOIN LATERAL jsonb_array_elements(body->'changeOrders') change
 WHERE change->>'id'=p_co::text AND change->>'status'='approved'
  AND change->'organization_id'=body->'organizationId' AND change->'sales_order_id'=body->'order'->'id'
  AND change->'proposal_id'=body->'order'->'proposal_id'
)
SELECT facts FROM content WHERE octet_length(facts::text)<=1048576;
$$;
REVOKE ALL ON FUNCTION techsafe_source.equipment_application_facts(jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION techsafe_source.equipment_facts_evidence(p_facts jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE model jsonb; canonical jsonb;
BEGIN
 IF NOT coalesce(p_facts->>'factsVersion'='1' AND jsonb_typeof(p_facts->'binding')='object'
 AND jsonb_typeof(p_facts->'changeOrder')='object' AND jsonb_typeof(p_facts->'changeLines')='array'
 AND jsonb_typeof(p_facts->'lines')='array' AND octet_length(p_facts::text)<=1048576
 AND p_facts->'changeOrder'->'id'=p_facts->'binding'->'changeOrderId'
 AND p_facts->'changeOrder'->'organization_id'=p_facts->'binding'->'organizationId'
 AND p_facts->'changeOrder'->'sales_order_id'=p_facts->'binding'->'orderId'
 AND p_facts->'changeOrder'->'proposal_id'=p_facts->'binding'->'proposalId'
 AND p_facts->'changeOrder'->>'status'='approved'
 AND p_facts->'binding'->>'changeOrderId' ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$',false) THEN RETURN NULL; END IF;
 model:=jsonb_build_object('readModelVersion',1,'connectionId',p_facts->'binding'->'connectionId',
  'organizationId',p_facts->'binding'->'organizationId','order',jsonb_build_object('id',p_facts->'binding'->'orderId',
   'proposal_id',p_facts->'binding'->'proposalId'),'lines',p_facts->'lines',
  'changeOrders',jsonb_build_array(p_facts->'changeOrder'),'changeLines',p_facts->'changeLines');
 canonical:=techsafe_source.equipment_application_facts(model,(p_facts->'binding'->>'changeOrderId')::uuid);
 -- Reject unknown or missing fields, even when they do not affect a digest.
 -- The reader must never return a private dump hidden in an unhashed property.
 IF canonical IS DISTINCT FROM p_facts THEN RETURN NULL; END IF;
 RETURN techsafe_source.equipment_evidence_content(model);
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION techsafe_source.equipment_facts_evidence(jsonb) FROM PUBLIC,anon,authenticated,service_role;

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
  equipment_before_scope_hash,equipment_before_facts)
 VALUES((observed->>'organizationId')::uuid,(observed->>'connectionId')::uuid,(observed->>'orderId')::uuid,(observed->>'proposalId')::uuid,p_co,
  observed->>'sourceHash',observed->>'scopeHash',txid_current(),auth.uid(),input_hash,nextval('techsafe_source.equipment_observation_order_seq'),
  evidence->>'scopeHash',facts)
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
  equipment_after_scope_hash=evidence->>'scopeHash',equipment_after_facts=facts,
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

-- One historical pair at a time, behind the current reader's tenant/health gate.
-- It is NOT proof this historical pair still matches the current order.
CREATE FUNCTION techsafe_source.read_application_equipment_pair(p_connection uuid,p_order uuid,p_observation uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
WITH source AS MATERIALIZED (SELECT techsafe_source.read_order_equipment_source(p_connection,p_order) AS body),
observed AS MATERIALIZED (
 SELECT o.*,jsonb_build_object('connectionId',o.connection_id,'organizationId',o.organization_id,
  'orderId',o.sales_order_id,'proposalId',o.proposal_id,'changeOrderId',o.change_order_id) AS binding
 FROM techsafe_source.application_observations o JOIN source s ON s.body IS NOT NULL
  AND o.organization_id=(s.body->>'organizationId')::uuid AND o.proposal_id=(s.body->'order'->>'proposal_id')::uuid
 WHERE o.id=p_observation AND o.connection_id=p_connection AND o.sales_order_id=p_order
  AND o.completed_at IS NOT NULL AND o.equipment_completed_order>o.equipment_started_order
  AND o.equipment_before_facts IS NOT NULL AND o.equipment_after_facts IS NOT NULL
), evidence AS MATERIALIZED (
 SELECT o.*,techsafe_source.equipment_facts_evidence(o.equipment_before_facts) AS before_evidence,
  techsafe_source.equipment_facts_evidence(o.equipment_after_facts) AS after_evidence FROM observed o
)
SELECT jsonb_build_object('pairVersion',1,'observationId',id,'transactionId',transaction_id::text,'binding',binding,
 'startedOrder',equipment_started_order::text,'completedOrder',equipment_completed_order::text,
 'equipmentInputHash',equipment_input_hash,'beforeScopeHash',equipment_before_scope_hash,'afterScopeHash',equipment_after_scope_hash,
 'changeOrder',equipment_before_facts->'changeOrder','changeLines',equipment_before_facts->'changeLines',
 'beforeLines',equipment_before_facts->'lines','afterLines',equipment_after_facts->'lines',
 'scopeVerified',false,'snapshotReady',false,'quoteReady',false)
FROM evidence WHERE equipment_before_facts->'binding'=binding AND equipment_after_facts->'binding'=binding
 AND before_evidence->>'scopeHash'=equipment_before_scope_hash AND after_evidence->>'scopeHash'=equipment_after_scope_hash
 AND before_evidence->'inputs'->0->>'inputHash'=equipment_input_hash AND after_evidence->'inputs'->0->>'inputHash'=equipment_input_hash;
$$;
REVOKE ALL ON FUNCTION techsafe_source.read_application_equipment_pair(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
