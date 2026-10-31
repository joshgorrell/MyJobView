-- Private export-candidate gate only. Existing MJV completion workflows and
-- internal evidence readers/observers remain unchanged.
CREATE FUNCTION techsafe_source.read_order_draft_candidate(p_connection uuid,p_order uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
WITH eligible AS MATERIALIZED (
 SELECT so.id,so.organization_id,so.proposal_id,so.project_id,so.status,
  CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object('id',p.id,'organization_id',p.organization_id,
   'sales_order_id',p.sales_order_id,'substantial_completion_date',p.substantial_completion_date) END AS project
 FROM public.sales_orders so LEFT JOIN public.projects p ON p.id=so.project_id
  AND p.organization_id=so.organization_id AND p.sales_order_id=so.id
 WHERE so.id=p_order AND so.status IN ('pending_deposit','pending_po','planning','active','complete','closed')
  AND (so.project_id IS NULL OR p.id IS NOT NULL)
  AND (p.substantial_completion_date IS NULL OR (isfinite(p.substantial_completion_date)
   AND p.substantial_completion_date BETWEEN date '0001-01-01' AND CURRENT_DATE))
  AND (so.status IN ('complete','closed') OR p.substantial_completion_date IS NOT NULL)
), source AS MATERIALIZED (
 SELECT e.*,techsafe_source.read_order_equipment_source(p_connection,e.id) AS body FROM eligible e
), content AS (
 SELECT (body-'sourceFingerprint')||jsonb_build_object('order',(body->'order')||jsonb_build_object('project_id',project_id),
  'completion',jsonb_build_object('asOfDate',CURRENT_DATE,'project',project)) AS body
 FROM source WHERE body IS NOT NULL AND body->>'organizationId'=organization_id::text
  AND body->'order'->>'id'=id::text AND body->'order'->>'proposal_id'=proposal_id::text
  AND body->'order'->>'status'=status
)
SELECT body||jsonb_build_object('sourceFingerprint',encode(sha256(convert_to(body::text,'UTF8')),'hex'))
 FROM content WHERE octet_length(body::text)<=4194304;
$$;
REVOKE ALL ON FUNCTION techsafe_source.read_order_draft_candidate(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
-- Not ready, future-dated, unknown or mismatched projects return no candidate.
-- No sender/receiver/caller is installed and no active plan can be changed here.
