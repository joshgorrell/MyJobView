-- Dormant observation primitives only. No source function/trigger is changed.
-- A future reviewed caller must surround the ORIGINAL applier, never replace it.
CREATE TABLE techsafe_source.application_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  sales_order_id uuid NOT NULL,
  proposal_id uuid NOT NULL,
  change_order_id uuid NOT NULL,
  source_hash text NOT NULL CHECK(source_hash ~ '^[a-f0-9]{64}$'),
  before_scope_hash text NOT NULL CHECK(before_scope_hash ~ '^[a-f0-9]{64}$'),
  after_scope_hash text CHECK(after_scope_hash ~ '^[a-f0-9]{64}$'),
  transaction_id bigint NOT NULL,
  actor_id uuid,
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  CHECK((completed_at IS NULL)=(after_scope_hash IS NULL))
);
ALTER TABLE techsafe_source.application_observations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE techsafe_source.application_observations FROM PUBLIC,anon,authenticated;
CREATE INDEX application_observations_order_idx ON techsafe_source.application_observations(sales_order_id,started_at);

-- One STABLE statement snapshot, plus the caller's own transactional writes.
-- Bound source work before aggregating; never certify a truncated read set.
-- Hash private source content, retaining only digests (no notes/customer data).
CREATE FUNCTION techsafe_source.application_read_set(p_co uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
WITH binding AS MATERIALIZED (
  SELECT co.id AS co_id,co.organization_id,so.id AS order_id,so.proposal_id,connection.connection_id
  FROM public.change_orders co JOIN public.sales_orders so
    ON so.id=co.sales_order_id AND so.organization_id=co.organization_id
  JOIN public.proposals proposal ON proposal.id=so.proposal_id AND proposal.organization_id=co.organization_id
  JOIN techsafe_source.integration_connections connection ON connection.organization_id=co.organization_id
  WHERE co.id=p_co AND co.status='approved' AND connection.enabled IS TRUE AND connection.status='active'
    AND ((auth.uid() IS NULL AND current_setting('role',true) NOT IN ('anon','authenticated')
      AND coalesce(current_setting('request.jwt.claim.role',true),'') NOT IN ('anon','authenticated'))
      OR EXISTS(SELECT 1 FROM public.profiles profile
      WHERE profile.id=auth.uid() AND profile.organization_id=co.organization_id AND profile.is_active IS TRUE))
), orders AS MATERIALIZED (
  SELECT co.id,to_jsonb(co)-ARRAY['updated_at','is_active']::text[] AS body
  FROM public.change_orders co JOIN binding b ON co.sales_order_id=b.order_id
  ORDER BY co.id LIMIT 1001
), items AS MATERIALIZED (
  SELECT item.id,to_jsonb(item) AS body FROM public.change_order_line_items item
  JOIN public.change_orders co ON co.id=item.change_order_id JOIN binding b ON co.sales_order_id=b.order_id
  ORDER BY item.id LIMIT 10001
), scope AS MATERIALIZED (
  SELECT line.id,to_jsonb(line)-ARRAY['updated_at','task_completed','tasks_seeded_at']::text[] AS body
  FROM public.proposal_line_items line JOIN binding b ON line.proposal_id=b.proposal_id
  ORDER BY line.id LIMIT 10001
), content AS (
  SELECT b.*,jsonb_build_object('organizationId',b.organization_id,'connectionId',b.connection_id,
    'orderId',b.order_id,'proposalId',b.proposal_id,
    'changeOrders',coalesce((SELECT jsonb_agg(body ORDER BY id) FROM orders),'[]'::jsonb),
    'changeLines',coalesce((SELECT jsonb_agg(body ORDER BY id) FROM items),'[]'::jsonb)) AS source,
    coalesce((SELECT jsonb_agg(body ORDER BY id) FROM scope),'[]'::jsonb) AS scope
  FROM binding b WHERE (SELECT count(*) FROM orders)<=1000
    AND (SELECT count(*) FROM items)<=10000 AND (SELECT count(*) FROM scope)<=10000
    AND coalesce((SELECT sum(octet_length(body::text)) FROM orders),0)
      + coalesce((SELECT sum(octet_length(body::text)) FROM items),0)
      + coalesce((SELECT sum(octet_length(body::text)) FROM scope),0)<=4194304
    AND NOT EXISTS(SELECT 1 FROM orders WHERE body->>'organization_id' IS DISTINCT FROM b.organization_id::text)
    AND NOT EXISTS(SELECT 1 FROM items WHERE body->>'organization_id' IS DISTINCT FROM b.organization_id::text)
    AND NOT EXISTS(SELECT 1 FROM scope WHERE body->>'organization_id' IS DISTINCT FROM b.organization_id::text)
)
SELECT jsonb_build_object('organizationId',organization_id,'connectionId',connection_id,
  'orderId',order_id,'proposalId',proposal_id,
  'sourceHash',encode(sha256(convert_to(source::text,'UTF8')),'hex'),
  'scopeHash',encode(sha256(convert_to(scope::text,'UTF8')),'hex')) FROM content;
$$;
REVOKE ALL ON FUNCTION techsafe_source.application_read_set(uuid) FROM PUBLIC,anon,authenticated;

-- Exceptions from observation alone are contained in a subtransaction. No
-- caller may wrap/suppress the original application error with this helper.
-- A null return is missing evidence, NEVER an application/quote certificate.
CREATE FUNCTION techsafe_source.try_begin_application_observation(p_co uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE observed jsonb; identity uuid;
BEGIN
  observed:=techsafe_source.application_read_set(p_co);
  IF observed IS NULL THEN RETURN NULL; END IF;
  INSERT INTO techsafe_source.application_observations(organization_id,connection_id,sales_order_id,proposal_id,
    change_order_id,source_hash,before_scope_hash,transaction_id,actor_id)
  VALUES((observed->>'organizationId')::uuid,(observed->>'connectionId')::uuid,(observed->>'orderId')::uuid,
    (observed->>'proposalId')::uuid,p_co,observed->>'sourceHash',observed->>'scopeHash',txid_current(),auth.uid())
  RETURNING id INTO identity;
  RETURN identity;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION techsafe_source.try_begin_application_observation(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION techsafe_source.try_finish_application_observation(p_co uuid,p_observation uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE observed jsonb; identity uuid;
BEGIN
  IF p_observation IS NULL THEN RETURN NULL; END IF;
  observed:=techsafe_source.application_read_set(p_co);
  IF observed IS NULL THEN RETURN NULL; END IF;
  UPDATE techsafe_source.application_observations SET after_scope_hash=observed->>'scopeHash',completed_at=clock_timestamp()
  WHERE id=p_observation AND change_order_id=p_co AND transaction_id=txid_current()
    AND actor_id IS NOT DISTINCT FROM auth.uid() AND completed_at IS NULL
    AND organization_id=(observed->>'organizationId')::uuid AND connection_id=(observed->>'connectionId')::uuid
    AND sales_order_id=(observed->>'orderId')::uuid AND proposal_id=(observed->>'proposalId')::uuid
    AND source_hash=observed->>'sourceHash'
  RETURNING id INTO identity;
  RETURN identity;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION techsafe_source.try_finish_application_observation(uuid,uuid) FROM PUBLIC,anon,authenticated;
-- No caller grants, public RPC, source hook, connection seed or worker is added.
-- Completion means only that a trusted future caller reported application
-- return in the same transaction. It does not certify intended scope, approval
-- authority, duplicate-add semantics, historical state or checkout freshness.
