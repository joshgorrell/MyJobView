-- Draft visibility no longer waits for substantial/final completion. Original
-- approval and applied-change evidence remain mandatory in the composed reader.
DO $guard$
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang
  WHERE p.oid=to_regprocedure('techsafe_source.read_order_draft_candidate(uuid,uuid)')
   AND NOT p.prosecdef AND NOT p.proretset AND p.prokind='f' AND p.provolatile='s'
   AND p.prorettype='jsonb'::regtype AND l.lanname='sql' AND pg_get_userbyid(p.proowner)='postgres'
   AND p.proconfig=ARRAY['search_path=""']::text[]
   AND encode(sha256(convert_to(btrim(regexp_replace(p.prosrc,'[[:space:]]+',' ','g')),'UTF8')),'hex')
    ='b7ca76d22fa8863be902838b9b41a8232f7e2d4912d37e2fcfe49ddbaec6a4e4'
 ) THEN RAISE EXCEPTION 'Review changed Techsafe draft candidate reader'; END IF;
END;
$guard$;

CREATE OR REPLACE FUNCTION techsafe_source.read_order_draft_candidate(p_connection uuid,p_order uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
WITH eligible AS MATERIALIZED (
 SELECT so.id,so.organization_id,so.proposal_id,so.status
 FROM public.sales_orders so
 WHERE so.id=p_order AND so.status IN ('pending_deposit','pending_po','planning','active','complete','closed')
), source AS MATERIALIZED (
 SELECT e.*,techsafe_source.read_order_equipment_source(p_connection,e.id) AS body FROM eligible e
), content AS (
 SELECT body-ARRAY['sourceFingerprint','completion']::text[] AS body FROM source
 WHERE body IS NOT NULL AND body->>'organizationId'=organization_id::text
  AND body->'order'->>'id'=id::text AND body->'order'->>'proposal_id'=proposal_id::text
  AND body->'order'->>'status'=status
)
SELECT body||jsonb_build_object('sourceFingerprint',encode(sha256(convert_to(body::text,'UTF8')),'hex'))
 FROM content WHERE octet_length(body::text)<=4194304;
$$;
REVOKE ALL ON FUNCTION techsafe_source.read_order_draft_candidate(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
-- No project/date reads, backfill, source workflow change, sender, or activation.
