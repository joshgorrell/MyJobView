-- Private evidence only. Existing MJV applier/approval/trigger bodies are untouched.
-- Refuse to overwrite a later/custom private observation implementation.
DO $guard$
DECLARE signature text; expected text; actual text;
BEGIN
 FOR signature,expected IN SELECT * FROM (VALUES
  ('techsafe_source.try_begin_application_observation(uuid)','54a43aab71fb5135b07e880a630ac5ad52d22307702afbf9ff2df97917d6597a'),
  ('techsafe_source.try_finish_application_observation(uuid,uuid)','b953344615317011ae37c5c84208a24b1249e9a1a59d2946abadfe50a8a19ad7')) AS expected(signature,hash)
 LOOP
  SELECT encode(sha256(convert_to(btrim(regexp_replace(p.prosrc,'[[:space:]]+',' ','g')),'UTF8')),'hex') INTO actual
  FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang
  WHERE p.oid=to_regprocedure(signature) AND NOT p.prosecdef AND NOT p.proretset AND p.prokind='f' AND p.provolatile='v'
   AND p.prorettype='uuid'::regtype AND l.lanname='plpgsql' AND pg_get_userbyid(p.proowner)='postgres'
   AND p.proconfig=ARRAY['search_path=""']::text[];
  IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Review changed observation helper: %',signature; END IF;
 END LOOP;
END;
$guard$;

ALTER TABLE techsafe_source.application_observations
 ADD COLUMN equipment_input_hash text CHECK(equipment_input_hash ~ '^[a-f0-9]{64}$'),
 ADD COLUMN equipment_after_scope_hash text CHECK(equipment_after_scope_hash ~ '^[a-f0-9]{64}$'),
 ADD COLUMN equipment_started_order bigint CHECK(equipment_started_order>0),
 ADD COLUMN equipment_completed_order bigint CHECK(equipment_completed_order>equipment_started_order);
ALTER TABLE techsafe_source.application_observations ADD CONSTRAINT equipment_completion_evidence
 CHECK(equipment_completed_order IS NULL OR (equipment_started_order IS NOT NULL AND equipment_input_hash IS NOT NULL
  AND equipment_after_scope_hash IS NOT NULL AND completed_at IS NOT NULL));
CREATE SEQUENCE techsafe_source.equipment_observation_order_seq AS bigint CACHE 1 NO CYCLE;
REVOKE ALL ON SEQUENCE techsafe_source.equipment_observation_order_seq FROM PUBLIC,anon,authenticated,service_role;
-- Nullable on purpose: old observations do not become new proof through backfill.

CREATE FUNCTION techsafe_source.equipment_evidence_content(p_model jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
WITH model AS (
 SELECT p_model AS body WHERE p_model->>'readModelVersion'='1'
  AND jsonb_typeof(p_model->'lines')='array' AND jsonb_typeof(p_model->'changeOrders')='array'
  AND jsonb_typeof(p_model->'changeLines')='array'
), scope AS (
 SELECT jsonb_build_object('organizationId',body->'organizationId','orderId',body->'order'->'id',
  'proposalId',body->'order'->'proposal_id','lines',coalesce((SELECT jsonb_agg(
   jsonb_build_object('line',jsonb_build_object('id',line->'line'->'id','organization_id',line->'line'->'organization_id',
    'proposal_id',line->'line'->'proposal_id','product_id',line->'line'->'product_id','item_type',line->'line'->'item_type',
    'quantity',line->'line'->'quantity','is_customer_supplied',line->'line'->'is_customer_supplied',
    'description',line->'line'->'description','is_hidden',line->'line'->'is_hidden'),
    'unitSalePrice',line->'unitSalePrice') ORDER BY line->'line'->>'id')
   FROM jsonb_array_elements(body->'lines') line),'[]'::jsonb)) AS value FROM model
), change_content AS (
 SELECT item->>'change_order_id' AS co_id,jsonb_agg(jsonb_build_object('id',item->'id','organization_id',item->'organization_id',
   'change_order_id',item->'change_order_id','action_type',item->'action_type','proposal_line_item_id',item->'proposal_line_item_id',
   'product_id',item->'product_id','product_name',item->'product_name','product_description',item->'product_description',
   'item_type',item->'item_type','new_quantity',item->'new_quantity','new_unit_price',item->'new_unit_price','remove_scope',item->'remove_scope',
   'sort_order',item->'sort_order','created_at',item->'created_at') ORDER BY item->>'id') AS lines
 FROM model CROSS JOIN LATERAL jsonb_array_elements(body->'changeLines') item GROUP BY item->>'change_order_id'
), inputs AS (
 SELECT change->>'id' AS id,jsonb_build_object('organizationId',body->'organizationId','orderId',body->'order'->'id',
  'proposalId',body->'order'->'proposal_id','changeOrder',jsonb_build_object('id',change->'id',
   'organization_id',change->'organization_id','sales_order_id',change->'sales_order_id','proposal_id',change->'proposal_id','status',change->'status'),
  'lines',coalesce(change_content.lines,'[]'::jsonb)) AS value
 FROM model CROSS JOIN LATERAL jsonb_array_elements(body->'changeOrders') change
 LEFT JOIN change_content ON change_content.co_id=change->>'id'
)
SELECT jsonb_build_object('version',2,'scopeHash',encode(sha256(convert_to(scope.value::text,'UTF8')),'hex'),
 'inputs',coalesce((SELECT jsonb_agg(jsonb_build_object('changeOrderId',id,'inputHash',encode(sha256(convert_to(value::text,'UTF8')),'hex')) ORDER BY id) FROM inputs),'[]'::jsonb))
FROM scope;
$$;
REVOKE ALL ON FUNCTION techsafe_source.equipment_evidence_content(jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION techsafe_source.read_order_equipment_source(p_connection uuid,p_order uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
WITH source AS MATERIALIZED (SELECT techsafe_source.read_order_source(p_connection,p_order) AS body),
model AS MATERIALIZED (
 SELECT body||jsonb_build_object('changeLines',coalesce((SELECT jsonb_agg(item||jsonb_build_object(
  'sort_order',line.sort_order,'created_at',extract(epoch FROM line.created_at)::text) ORDER BY item->>'id')
  FROM jsonb_array_elements(body->'changeLines') item JOIN public.change_order_line_items line ON line.id=(item->>'id')::uuid),'[]'::jsonb)) AS body
 FROM source WHERE body IS NOT NULL
),
content AS (
 SELECT (body-'sourceFingerprint')||jsonb_build_object('equipmentEvidence',techsafe_source.equipment_evidence_content(body),
  'observations',coalesce((SELECT jsonb_agg(item||jsonb_build_object('equipmentInputHash',observed.equipment_input_hash,
   'equipmentAfterScopeHash',observed.equipment_after_scope_hash,'equipmentStartedOrder',observed.equipment_started_order::text,
   'equipmentCompletedOrder',observed.equipment_completed_order::text) ORDER BY item->>'id')
   FROM jsonb_array_elements(body->'observations') item JOIN techsafe_source.application_observations observed ON observed.id=(item->>'id')::uuid),'[]'::jsonb)) AS body
 FROM model WHERE body IS NOT NULL
)
SELECT body||jsonb_build_object('sourceFingerprint',encode(sha256(convert_to(body::text,'UTF8')),'hex'))
 FROM content WHERE octet_length(body::text)<=4194304;
$$;
REVOKE ALL ON FUNCTION techsafe_source.read_order_equipment_source(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION techsafe_source.try_begin_application_observation(p_co uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE observed jsonb; equipment jsonb; input_hash text; identity uuid;
BEGIN
 observed:=techsafe_source.application_read_set(p_co);
 IF observed IS NULL THEN RETURN NULL; END IF;
 equipment:=techsafe_source.read_order_equipment_source((observed->>'connectionId')::uuid,(observed->>'orderId')::uuid);
 SELECT item->>'inputHash' INTO input_hash FROM jsonb_array_elements(equipment->'equipmentEvidence'->'inputs') item WHERE item->>'changeOrderId'=p_co::text;
 IF equipment IS NULL OR input_hash IS NULL THEN RETURN NULL; END IF;
 INSERT INTO techsafe_source.application_observations(organization_id,connection_id,sales_order_id,proposal_id,change_order_id,
  source_hash,before_scope_hash,transaction_id,actor_id,equipment_input_hash,equipment_started_order)
 VALUES((observed->>'organizationId')::uuid,(observed->>'connectionId')::uuid,(observed->>'orderId')::uuid,(observed->>'proposalId')::uuid,p_co,
  observed->>'sourceHash',observed->>'scopeHash',txid_current(),auth.uid(),input_hash,nextval('techsafe_source.equipment_observation_order_seq'))
 RETURNING id INTO identity;
 RETURN identity;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION techsafe_source.try_begin_application_observation(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION techsafe_source.try_finish_application_observation(p_co uuid,p_observation uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE observed jsonb; equipment jsonb; input_hash text; identity uuid;
BEGIN
 IF p_observation IS NULL THEN RETURN NULL; END IF;
 observed:=techsafe_source.application_read_set(p_co);
 IF observed IS NULL THEN RETURN NULL; END IF;
 equipment:=techsafe_source.read_order_equipment_source((observed->>'connectionId')::uuid,(observed->>'orderId')::uuid);
 SELECT item->>'inputHash' INTO input_hash FROM jsonb_array_elements(equipment->'equipmentEvidence'->'inputs') item WHERE item->>'changeOrderId'=p_co::text;
 IF equipment IS NULL OR input_hash IS NULL THEN RETURN NULL; END IF;
 UPDATE techsafe_source.application_observations SET after_scope_hash=observed->>'scopeHash',completed_at=clock_timestamp(),
  equipment_after_scope_hash=equipment->'equipmentEvidence'->>'scopeHash',
  equipment_completed_order=nextval('techsafe_source.equipment_observation_order_seq')
 WHERE id=p_observation AND change_order_id=p_co AND transaction_id=txid_current()
  AND actor_id IS NOT DISTINCT FROM auth.uid() AND completed_at IS NULL
  AND organization_id=(observed->>'organizationId')::uuid AND connection_id=(observed->>'connectionId')::uuid
  AND sales_order_id=(observed->>'orderId')::uuid AND proposal_id=(observed->>'proposalId')::uuid
  AND source_hash=observed->>'sourceHash' AND equipment_input_hash=input_hash
 RETURNING id INTO identity;
 RETURN identity;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION techsafe_source.try_finish_application_observation(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
-- Ordinary private evidence failures remain contained. No control is enabled,
-- no new source hook/caller is installed and no source action is replayed.
