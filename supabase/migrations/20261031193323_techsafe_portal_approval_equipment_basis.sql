-- Read-only candidate evidence from an EXISTING private portal approval record.
-- Does not change approvals, source rows, receipt ACLs, controls or connections.
CREATE FUNCTION techsafe_source.read_portal_approval_equipment_basis(p_connection uuid,p_order uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
WITH current_model AS MATERIALIZED (
 SELECT techsafe_source.read_order_equipment_source(p_connection,p_order) AS body
), binding AS MATERIALIZED (
 SELECT so.id AS order_id,so.proposal_id,so.contact_id,so.organization_id,so.created_at AS order_created_at,
  p.approved_by,p.approved_at,p.approval_completed_at,p.current_portal_version,p.accepted_via_method
 FROM current_model m JOIN public.sales_orders so ON so.id=p_order
  AND so.organization_id::text=m.body->>'organizationId' AND so.proposal_id::text=m.body->'order'->>'proposal_id'
 JOIN public.proposals p ON p.id=so.proposal_id AND p.organization_id=so.organization_id
  AND p.contact_id=so.contact_id AND p.sales_order_id=so.id
 WHERE m.body IS NOT NULL AND p.status='approved'
), headers AS MATERIALIZED (
 SELECT d.request_id,d.action FROM private.proposal_customer_decisions d JOIN binding b ON d.proposal_id=b.proposal_id
 ORDER BY d.request_id LIMIT 1001
), candidate AS MATERIALIZED (
 SELECT b.*,d.request_id,d.portal_version,d.created_at,d.evidence
 FROM binding b JOIN private.proposal_customer_decisions d ON d.proposal_id=b.proposal_id
 JOIN headers h ON h.request_id=d.request_id AND h.action='approve'
 WHERE (SELECT count(*) FROM headers)<=1000 AND (SELECT count(*) FROM headers WHERE action='approve')=1
  AND d.action='approve' AND d.result->>'status'='approved' AND d.result->>'sales_order_id'=b.order_id::text
  AND d.viewer_id=b.approved_by AND d.created_at=b.approved_at AND d.created_at=b.approval_completed_at
  AND d.created_at=b.order_created_at AND d.created_at<=statement_timestamp()
  AND d.portal_version=b.current_portal_version AND d.portal_version>=0
  AND d.details->>'method'=b.accepted_via_method AND b.accepted_via_method IN ('payment','purchase_order')
  AND jsonb_typeof(d.evidence)='object' AND octet_length(d.evidence::text)<=4194304
  AND d.evidence->'proposal'->>'id'=b.proposal_id::text
  AND d.evidence->'proposal'->>'organization_id'=b.organization_id::text
  AND d.evidence->'proposal'->>'contact_id'=b.contact_id::text
  AND d.evidence->'proposal'->'sales_order_id'='null'::jsonb
  AND d.evidence->'proposal'->'current_portal_version'=to_jsonb(d.portal_version)
  AND d.evidence->'proposal'->>'status' IN ('sent','viewed','portal')
  AND d.evidence->'proposal'->'is_active_revision'='true'::jsonb
  AND jsonb_typeof(d.evidence->'items')='array'
), items AS MATERIALIZED (
 SELECT item FROM candidate c CROSS JOIN LATERAL jsonb_array_elements(c.evidence->'items') item
 LIMIT 10001
), bounded AS (
 SELECT c.* FROM candidate c WHERE (SELECT count(*) FROM items)<=10000
  AND NOT EXISTS(SELECT 1 FROM items WHERE
   jsonb_typeof(item) IS DISTINCT FROM 'object'
   OR coalesce(item->>'id','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
   OR item->>'organization_id' IS DISTINCT FROM c.organization_id::text
   OR item->>'proposal_id' IS DISTINCT FROM c.proposal_id::text
   OR (item->'product_id' IS DISTINCT FROM 'null'::jsonb AND coalesce(item->>'product_id','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$')
   OR coalesce(item->>'item_type','') NOT IN ('material','labor','both')
   OR jsonb_typeof(item->'quantity') IS DISTINCT FROM 'number' OR jsonb_typeof(item->'unit_price') IS DISTINCT FROM 'number'
   OR jsonb_typeof(item->'is_customer_supplied') IS DISTINCT FROM 'boolean' OR jsonb_typeof(item->'is_hidden') IS DISTINCT FROM 'boolean'
   OR jsonb_typeof(item->'description') IS DISTINCT FROM 'string' OR octet_length(item->>'description')>16384)
  AND NOT EXISTS(SELECT 1 FROM items GROUP BY item->>'id' HAVING count(*)>1)
), content AS (
 SELECT c.*,coalesce((SELECT jsonb_agg(jsonb_build_object('line',jsonb_build_object('id',item->'id',
  'organization_id',item->'organization_id','proposal_id',item->'proposal_id','product_id',item->'product_id',
  'item_type',item->'item_type','quantity',item->>'quantity','is_customer_supplied',item->'is_customer_supplied',
  'description',item->'description','is_hidden',item->'is_hidden'),'unitSalePrice',item->>'unit_price') ORDER BY item->>'id') FROM items),'[]'::jsonb) AS lines
 FROM bounded c
), evidence AS (
 SELECT c.*,techsafe_source.equipment_evidence_content(jsonb_build_object('readModelVersion',1,'organizationId',organization_id,
  'order',jsonb_build_object('id',order_id,'proposal_id',proposal_id),'lines',lines,'changeOrders','[]'::jsonb,'changeLines','[]'::jsonb)) AS digests
 FROM content c WHERE octet_length(lines::text)<=1048576
)
SELECT jsonb_build_object('basisVersion',1,'sourceKind','customer_portal_approval',
 'binding',jsonb_build_object('connectionId',p_connection,'organizationId',organization_id,'orderId',order_id,'proposalId',proposal_id),
 'approvalRef',request_id,'portalVersion',portal_version,'approvedAtEpoch',extract(epoch FROM created_at)::text,
 'approvedRowsHash',digests->>'scopeHash','lines',lines,
 'originalScopeVerified',false,'scopeVerified',false,'snapshotReady',false,'quoteReady',false)
FROM evidence;
$$;
REVOKE ALL ON FUNCTION techsafe_source.read_portal_approval_equipment_basis(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
-- The result is an approved-row candidate, NOT initial sold membership or an
-- authorization certificate. Manual/ambiguous approvals remain unavailable.
