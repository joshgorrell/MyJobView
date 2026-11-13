-- Read-only Techsafe legacy addition provenance and financial preflight.
-- Never treats matching descriptions or prices as authorization to link products.
-- Bind a specific approved sales order in the WHERE clause before use.
WITH approved_additions AS (
 SELECT co.sales_order_id,co.id change_order_id,li.id change_line_id,
        li.product_name,li.product_id,li.new_quantity,li.new_unit_price,
        li.new_total,li.new_labor_total,li.proposal_line_item_id,
        so.proposal_id,p.company_id,p.organization_id
 FROM public.change_orders co
 JOIN public.change_order_line_items li ON li.change_order_id=co.id
 JOIN public.sales_orders so ON so.id=co.sales_order_id
 JOIN public.proposals p ON p.id=so.proposal_id
 WHERE co.sales_order_id='d8b30c4b-70d0-4180-aca0-907db5a5fa27'
   AND co.status='approved' AND co.is_locked=true AND co.is_active=false
   AND li.action_type='add'
), evidence AS (
 SELECT a.*,pr.id catalog_product_id,pr.company_id catalog_company_id,
  (SELECT count(*) FROM public.proposal_line_items pli
    WHERE pli.proposal_id=a.proposal_id AND pli.committed_change_order_line_id=a.change_line_id) committed_source_count,
  (SELECT count(*) FROM public.products p2 WHERE p2.company_id=a.company_id
    AND lower(trim(p2.name))=lower(trim(a.product_name))) exact_name_candidates
 FROM approved_additions a LEFT JOIN public.products pr ON pr.id=a.product_id
)
SELECT change_order_id,change_line_id,product_name,new_quantity,new_unit_price,
 new_total,new_labor_total,product_id,proposal_line_item_id,
 committed_source_count,exact_name_candidates,
 CASE WHEN committed_source_count=1 AND catalog_product_id IS NOT NULL
   AND catalog_company_id=company_id THEN 'provenance_candidate_review_required'
 ELSE 'HOLD_missing_committed_catalog_provenance' END certification_status
FROM evidence ORDER BY change_line_id;
