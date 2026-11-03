-- Integration-owned settings only. No source business table/trigger is changed.
ALTER TABLE techsafe_source.integration_connections
  ADD COLUMN minimum_unit_value_cents bigint NOT NULL DEFAULT 0
    CHECK(minimum_unit_value_cents BETWEEN 0 AND 9007199254740991);
CREATE INDEX application_observations_connection_order_id_idx
  ON techsafe_source.application_observations(connection_id,sales_order_id,id);

-- Private, caller-privilege read of one statement snapshot. No API-role grants.
-- Facts/evidence are returned for a future verifier; no scope/price is certified.
CREATE FUNCTION techsafe_source.read_order_source(p_connection uuid,p_order uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
WITH binding AS MATERIALIZED (
 SELECT so.id AS order_id,so.proposal_id,so.contact_id,so.organization_id,so.status,
   customer.full_name,connection.connection_id,connection.minimum_unit_value_cents,
   proposal.discount_percent AS proposal_discount_percent,proposal.discount_amount AS proposal_discount_amount,
   settings.discount_percent AS settings_discount_percent
 FROM public.sales_orders so
 JOIN public.proposals proposal ON proposal.id=so.proposal_id AND proposal.organization_id=so.organization_id
 JOIN public.contacts customer ON customer.id=so.contact_id AND customer.organization_id=so.organization_id
 JOIN techsafe_source.integration_connections connection ON connection.organization_id=so.organization_id
 LEFT JOIN public.proposal_settings settings ON settings.proposal_id=proposal.id
 WHERE so.id=p_order AND connection.connection_id=p_connection
   AND connection.enabled IS TRUE AND connection.status='active'
   AND connection.last_verified_at>=statement_timestamp()-interval '5 minutes'
   AND connection.last_verified_at<=statement_timestamp()
   AND (settings.proposal_id IS NULL OR settings.organization_id=so.organization_id)
   AND char_length(customer.full_name) BETWEEN 1 AND 256 AND btrim(customer.full_name)<>''
   AND ((auth.uid() IS NULL AND current_setting('role',true) NOT IN ('anon','authenticated','service_role')
      AND coalesce(current_setting('request.jwt.claim.role',true),'') NOT IN ('anon','authenticated','service_role'))
    OR EXISTS(SELECT 1 FROM public.profiles profile WHERE profile.id=auth.uid()
      AND profile.organization_id=so.organization_id AND profile.is_active IS TRUE))
), orders AS MATERIALIZED (
 SELECT co.id,co.organization_id,jsonb_build_object('id',co.id,'organization_id',co.organization_id,
  'sales_order_id',co.sales_order_id,'proposal_id',co.proposal_id,'status',co.status,'is_active',co.is_active,
  'discount_percent',co.discount_percent::text,'is_billable',co.is_billable,'change_amount',co.change_amount::text,
  'tax_amount',co.tax_amount::text) AS body
 FROM public.change_orders co JOIN binding b ON co.sales_order_id=b.order_id ORDER BY co.id LIMIT 1001
), change_lines AS MATERIALIZED (
 SELECT item.id,item.organization_id,
  CASE WHEN octet_length(coalesce(item.product_name,''))<=16384
    AND octet_length(coalesce(item.product_description,''))<=16384 THEN
   jsonb_build_object('id',item.id,'organization_id',item.organization_id,'change_order_id',item.change_order_id,
    'action_type',item.action_type,'proposal_line_item_id',item.proposal_line_item_id,'product_id',item.product_id,
    'product_name',item.product_name,'product_description',item.product_description,'item_type',item.item_type,
    'new_quantity',item.new_quantity::text,'new_unit_price',item.new_unit_price::text,'remove_scope',item.remove_scope)
  END AS body
 FROM public.change_order_line_items item JOIN public.change_orders co ON co.id=item.change_order_id
 JOIN binding b ON co.sales_order_id=b.order_id ORDER BY item.id LIMIT 10001
), scope AS MATERIALIZED (
 SELECT line.id,line.organization_id,product.organization_id AS product_org,product.id AS matched_product,
  exclusion.organization_id AS exclusion_org,exclusion.product_id AS matched_exclusion,
  CASE WHEN octet_length(line.description)<=16384 AND octet_length(coalesce(product.name,''))<=16384
    AND octet_length(coalesce(product.sku,''))<=1024 THEN
   jsonb_build_object('line',jsonb_build_object('id',line.id,'organization_id',line.organization_id,
    'proposal_id',line.proposal_id,'product_id',line.product_id,'item_type',line.item_type,
    'quantity',line.quantity::text,'is_customer_supplied',line.is_customer_supplied,
    'description',line.description,'is_hidden',line.is_hidden),
    'product',CASE WHEN product.id IS NULL THEN NULL ELSE jsonb_build_object('id',product.id,
     'organization_id',product.organization_id,'item_type',product.item_type,'sku',product.sku,'name',product.name) END,
    'exclusion',CASE WHEN exclusion.product_id IS NULL THEN NULL ELSE jsonb_build_object('product_id',exclusion.product_id,
     'organization_id',exclusion.organization_id,'excluded',exclusion.excluded,'miscellaneous_placeholder',exclusion.miscellaneous_placeholder) END,
    'unitSalePrice',line.unit_price::text,'salesPriceResolved',false,
    'membership',jsonb_build_object('orderId',b.order_id,'sourceLineId',line.id,'verified',false,'scope','unverified'))
  END AS body
 FROM public.proposal_line_items line JOIN binding b ON line.proposal_id=b.proposal_id
 LEFT JOIN public.products product ON product.id=line.product_id
 LEFT JOIN techsafe_source.product_exclusions exclusion ON exclusion.product_id=line.product_id
 ORDER BY line.id LIMIT 10001
), observations AS MATERIALIZED (
 SELECT observed.id,observed.organization_id,observed.proposal_id,
  jsonb_build_object('id',observed.id,'changeOrderId',observed.change_order_id,'connectionId',observed.connection_id,
   'sourceHash',observed.source_hash,'beforeScopeHash',observed.before_scope_hash,'afterScopeHash',observed.after_scope_hash,
   'transactionId',observed.transaction_id::text,'completed',observed.completed_at IS NOT NULL) AS body
 FROM techsafe_source.application_observations observed JOIN binding b ON observed.sales_order_id=b.order_id
  AND observed.connection_id=b.connection_id ORDER BY observed.id LIMIT 1001
), bounded AS (
 SELECT b.* FROM binding b
 WHERE (SELECT count(*) FROM orders)<=1000 AND (SELECT count(*) FROM change_lines)<=10000
  AND (SELECT count(*) FROM scope)<=10000 AND (SELECT count(*) FROM observations)<=1000
  AND NOT EXISTS(SELECT 1 FROM orders WHERE organization_id IS DISTINCT FROM b.organization_id)
  AND NOT EXISTS(SELECT 1 FROM change_lines WHERE body IS NULL OR organization_id IS DISTINCT FROM b.organization_id)
  AND NOT EXISTS(SELECT 1 FROM scope WHERE body IS NULL OR organization_id IS DISTINCT FROM b.organization_id
    OR matched_product IS NOT NULL AND product_org IS DISTINCT FROM b.organization_id
    OR matched_exclusion IS NOT NULL AND exclusion_org IS DISTINCT FROM b.organization_id)
  AND NOT EXISTS(SELECT 1 FROM observations WHERE organization_id IS DISTINCT FROM b.organization_id OR proposal_id IS DISTINCT FROM b.proposal_id)
  AND coalesce((SELECT sum(octet_length(body::text)) FROM orders),0)
    +coalesce((SELECT sum(octet_length(body::text)) FROM change_lines),0)
    +coalesce((SELECT sum(octet_length(body::text)) FROM scope),0)
    +coalesce((SELECT sum(octet_length(body::text)) FROM observations),0)<=4194304
), content AS (
 SELECT jsonb_build_object('readModelVersion',1,'organizationId',b.organization_id,'connectionId',b.connection_id,
  'currency','USD','minimumUnitValueCents',b.minimum_unit_value_cents,
  'order',jsonb_build_object('id',b.order_id,'organization_id',b.organization_id,'proposal_id',b.proposal_id,'contact_id',b.contact_id,'status',b.status),
  'customer',jsonb_build_object('id',b.contact_id,'organization_id',b.organization_id,'full_name',b.full_name),
  'pricingFacts',jsonb_build_object('proposalDiscountPercent',b.proposal_discount_percent::text,
   'proposalDiscountAmount',b.proposal_discount_amount::text,'settingsDiscountPercent',b.settings_discount_percent::text),
  'lines',coalesce((SELECT jsonb_agg(body ORDER BY id) FROM scope),'[]'::jsonb),
  'changeOrders',coalesce((SELECT jsonb_agg(body ORDER BY id) FROM orders),'[]'::jsonb),
  'changeLines',coalesce((SELECT jsonb_agg(body ORDER BY id) FROM change_lines),'[]'::jsonb),
  'observations',coalesce((SELECT jsonb_agg(body ORDER BY id) FROM observations),'[]'::jsonb),
  'snapshotReady',false,'quoteReady',false) AS body FROM bounded b
)
SELECT body||jsonb_build_object('sourceFingerprint',encode(sha256(convert_to(body::text,'UTF8')),'hex')) FROM content;
$$;
REVOKE ALL ON FUNCTION techsafe_source.read_order_source(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
-- No caller, role grant, schedule, connection seed, source trigger or live export.
