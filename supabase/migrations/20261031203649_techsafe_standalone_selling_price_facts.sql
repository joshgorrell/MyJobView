-- Private product unit-selling-price facts only. Aggregate project discounts,
-- percentages, fees, billing flags and totals are not pricing inputs.
CREATE FUNCTION techsafe_source.read_order_selling_price_facts(p_connection uuid,p_order uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
WITH source AS MATERIALIZED (SELECT techsafe_source.read_order_draft_candidate(p_connection,p_order) AS body),
children AS MATERIALIZED (
 SELECT DISTINCT l.parent_item_id FROM public.proposal_line_items l JOIN source s
  ON l.proposal_id::text=s.body->'order'->>'proposal_id' AND l.organization_id::text=s.body->>'organizationId'
 WHERE l.parent_item_id IS NOT NULL
), content AS (
 SELECT (s.body-ARRAY['sourceFingerprint','pricingFacts']::text[])||jsonb_build_object('sellingPriceContext',jsonb_build_object('version',1,
  'binding',jsonb_build_object('connectionId',p_connection,'organizationId',s.body->'organizationId',
   'orderId',s.body->'order'->'id','proposalId',s.body->'order'->'proposal_id')),
  'changeOrders',coalesce((SELECT jsonb_agg(jsonb_build_object('id',co->'id','organization_id',co->'organization_id',
   'sales_order_id',co->'sales_order_id','proposal_id',co->'proposal_id','status',co->'status','is_active',co->'is_active') ORDER BY co->>'id')
   FROM jsonb_array_elements(s.body->'changeOrders') co),'[]'::jsonb),
  'lines',coalesce((SELECT jsonb_agg(item||jsonb_build_object('salePriceFacts',
   CASE WHEN l.id IS NULL THEN NULL ELSE jsonb_build_object('parentItemId',l.parent_item_id,
    'displayMode',l.display_mode,'hasChildren',c.parent_item_id IS NOT NULL) END)
   ORDER BY item->'line'->>'id') FROM jsonb_array_elements(s.body->'lines') item
   LEFT JOIN public.proposal_line_items l ON l.id=(item->'line'->>'id')::uuid
    AND l.proposal_id::text=s.body->'order'->>'proposal_id' AND l.organization_id::text=s.body->>'organizationId'
   LEFT JOIN children c ON c.parent_item_id=l.id),'[]'::jsonb)) AS body
 FROM source s WHERE s.body IS NOT NULL
)
SELECT body||jsonb_build_object('sourceFingerprint',encode(sha256(convert_to(body::text,'UTF8')),'hex'))
 FROM content WHERE octet_length(body::text)<=4194304;
$$;
REVOKE ALL ON FUNCTION techsafe_source.read_order_selling_price_facts(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
-- No source write or pricing change. Scope and checkout authorization stay separate.

