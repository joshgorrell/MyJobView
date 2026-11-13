-- Read-only catalog/provenance audit for a single approved MJV Sales Order.
-- Bind $1 to sales_order_id. Never infer Misc from descriptions or prices.
WITH source_order AS (
 SELECT so.id sales_order_id,so.proposal_id,so.organization_id,so.company_id
 FROM public.sales_orders so WHERE so.id=$1
), source_lines AS (
 SELECT li.id line_id,li.product_id,li.description,li.quantity,li.unit_price,li.labor_total,
  p.company_id proposal_company_id,pr.company_id catalog_company_id,pr.name catalog_name,
  CASE WHEN li.product_id IS NULL THEN 'missing_catalog_id'
       WHEN pr.id IS NULL THEN 'catalog_product_not_found'
       WHEN pr.company_id IS DISTINCT FROM p.company_id THEN 'catalog_company_mismatch'
       WHEN lower(pr.name)='miscellaneous item' THEN 'catalog_misc_override'
       ELSE 'catalog_product' END catalog_status
 FROM source_order so
 JOIN public.proposals p ON p.id=so.proposal_id AND p.organization_id=so.organization_id
 JOIN public.proposal_line_items li ON li.proposal_id=p.id AND li.organization_id=p.organization_id
 LEFT JOIN public.products pr ON pr.id=li.product_id
), committed_changes AS (
 SELECT co.id change_order_id,co.status,co.is_locked,co.is_active,
  li.id change_line_id,li.action_type,li.proposal_line_item_id,
  li.product_id,li.product_name,li.new_quantity,li.new_unit_price,li.new_labor_total,
  applied.id committed_proposal_line_id,applied.product_id committed_catalog_id,
  CASE WHEN li.action_type='add' AND applied.id IS NULL THEN 'approved_addition_untraced'
       WHEN li.action_type='add' AND applied.product_id IS NULL THEN 'approved_addition_missing_catalog_id'
       WHEN li.action_type='remove' AND original.id IS NULL THEN 'approved_removal_untraced'
       ELSE 'traced' END provenance_status
 FROM source_order so
 JOIN public.change_orders co ON co.sales_order_id=so.sales_order_id AND co.organization_id=so.organization_id
 JOIN public.change_order_line_items li ON li.change_order_id=co.id AND li.organization_id=co.organization_id
 LEFT JOIN public.proposal_line_items applied ON applied.committed_change_order_line_id=li.id AND applied.proposal_id=so.proposal_id
 LEFT JOIN public.proposal_line_items original ON original.id=li.proposal_line_item_id AND original.proposal_id=so.proposal_id
 WHERE co.status='approved'
)
SELECT 'source_line' record_type,line_id::text record_id,catalog_status issue,
 jsonb_build_object('description',description,'product_id',product_id,'catalog_name',catalog_name,
  'proposal_company_id',proposal_company_id,'catalog_company_id',catalog_company_id,
  'quantity',quantity,'unit_price',unit_price,'labor_total',labor_total) details
FROM source_lines
UNION ALL
SELECT 'approved_change',change_line_id::text,provenance_status,
 jsonb_build_object('change_order_id',change_order_id,'action_type',action_type,'product_name',product_name,
  'change_product_id',product_id,'committed_proposal_line_id',committed_proposal_line_id,
  'committed_catalog_id',committed_catalog_id,'original_line_id',proposal_line_item_id,
  'new_quantity',new_quantity,'new_unit_price',new_unit_price,'new_labor_total',new_labor_total)
FROM committed_changes
ORDER BY record_type,record_id;
