-- PLAN ONLY: placeholder binding; no source queries are executed.
-- This omits the not-yet-installed private connection table. It is not a load benchmark.
EXPLAIN (FORMAT JSON, COSTS TRUE)
WITH binding AS MATERIALIZED (
  SELECT co.id AS co_id,co.organization_id,so.id AS order_id,so.proposal_id,connection.connection_id
  FROM public.change_orders co JOIN public.sales_orders so
    ON so.id=co.sales_order_id AND so.organization_id=co.organization_id
  JOIN public.proposals proposal ON proposal.id=so.proposal_id AND proposal.organization_id=co.organization_id
  JOIN LATERAL (SELECT co.organization_id, '00000000-0000-0000-0000-000000000001'::uuid AS connection_id, true AS enabled, 'active'::text AS status) connection ON connection.organization_id=co.organization_id
  WHERE co.id='00000000-0000-0000-0000-000000000000'::uuid AND co.status='approved' AND connection.enabled IS TRUE AND connection.status='active'
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
  'scopeHash',encode(sha256(convert_to(scope::text,'UTF8')),'hex')) FROM content;;
