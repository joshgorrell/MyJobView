import {normalizeSoldEquipmentItems} from './normalizeSoldEquipmentItems.mjs';
// Read-only source inspection; never authorizes delivery or repairs legacy rows.
const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(x);
const held=reason=>({ready:false,reason,items:[]});
export function createTechsafeCatalogSoldScopeReader(client){
 if(!client||typeof client.query!=='function')throw TypeError('trusted_postgres_client_required');
 return async({connectionId,orderId,minimumEligibleUnitPrice=0}={})=>{
  if(!uuid(connectionId)||!uuid(orderId))return held('invalid_binding');
  try{
   const bound=await client.query(`SELECT c.organization_id,c.proposal_id,c.enabled,c.status,
    so.proposal_id actual_proposal_id,p.status approval_status,p.approved_at,p.approval_completed_at
    FROM techsafe_source.integration_connections c
    JOIN public.sales_orders so ON so.id=c.sales_order_id AND so.organization_id=c.organization_id
    JOIN public.proposals p ON p.id=so.proposal_id AND p.organization_id=c.organization_id
    WHERE c.connection_id=$1 AND c.sales_order_id=$2`,[connectionId,orderId]);
   if(bound.rows?.length!==1)return held('connection_not_found');
   const c=bound.rows[0];
   if(c.enabled!==true||c.status!=='active')return held('connection_not_active');
   if(c.proposal_id!==c.actual_proposal_id||c.approval_status!=='approved'||!(c.approved_at||c.approval_completed_at))return held('sales_order_not_approved');
   const pending=await client.query(`SELECT count(*)::int count FROM public.change_orders co
    WHERE co.sales_order_id=$1 AND co.organization_id=$2 AND co.status='approved'
     AND (co.is_locked IS DISTINCT FROM true OR co.is_active IS DISTINCT FROM false OR
      EXISTS (SELECT 1 FROM public.change_order_line_items li WHERE li.change_order_id=co.id
       AND li.organization_id=co.organization_id AND li.action_type='add'
       AND NOT EXISTS(SELECT 1 FROM public.proposal_line_items pli WHERE pli.proposal_id=$3
        AND pli.organization_id=co.organization_id AND pli.committed_change_order_line_id=li.id)))`,
    [orderId,c.organization_id,c.proposal_id]);
   if(Number(pending.rows?.[0]?.count)!==0)return held('approved_change_scope_unreconciled');
   // Approved removals can supersede original proposal rows. Until the
   // committed removal ledger is reconciled, never certify those rows as sold.
   const removals=await client.query(`SELECT count(*)::int count
    FROM public.change_orders co
    JOIN public.change_order_line_items li ON li.change_order_id=co.id
     AND li.organization_id=co.organization_id
    WHERE co.sales_order_id=$1 AND co.organization_id=$2
     AND co.status='approved' AND li.action_type='remove'`,
    [orderId,c.organization_id]);
   if(Number(removals.rows?.[0]?.count)!==0)return held('approved_removal_scope_requires_reconciliation');
   const result=await client.query(`SELECT pli.id AS \"lineId\",pli.product_id AS \"productId\",
     pli.description,pli.quantity,pli.unit_price AS \"unitPrice\",
     COALESCE(pli.labor_total,0) AS \"soldLabor\",
     COALESCE(pli.is_customer_supplied,false) AS customer_supplied,
     pr.id IS NOT NULL AS catalog_found,
     (lower(pr.name)='miscellaneous item') AS \"isMisc\"
     FROM public.proposal_line_items pli
     LEFT JOIN public.products pr ON pr.id=pli.product_id
     WHERE pli.proposal_id=$1 AND pli.organization_id=$2
       AND COALESCE(pli.item_type,'part')<>'labor'
     ORDER BY pli.id`,[c.proposal_id,c.organization_id]);
   // A missing catalog reference is not a Misc item. Never infer or create a product.
   if(result.rows.some(row=>!row.catalog_found))return held('catalog_product_reconciliation_required');
   const items=normalizeSoldEquipmentItems(result.rows.filter(row=>!row.customer_supplied).map(row=>({...row,minimumEligibleUnitPrice})));
   // Labor-only rows and customer-supplied equipment labor must not disappear.
   const labor=await client.query(`SELECT COALESCE(SUM(CASE
    WHEN item_type='labor' THEN COALESCE(labor_total,line_total)
    ELSE COALESCE(labor_total,0) END),0)::numeric AS total
    FROM public.proposal_line_items
    WHERE proposal_id=$1 AND organization_id=$2`,[c.proposal_id,c.organization_id]);
   const soldLaborTotalCents=Math.round(Number(labor.rows?.[0]?.total)*100);
   if(!Number.isSafeInteger(soldLaborTotalCents)||soldLaborTotalCents<0)return held('invalid_total_sold_labor');
   return {ready:true,reason:null,items,soldLaborTotalCents,eligibleItems:items.filter(x=>x.eligibleByUnitMinimum),
    equipmentCents:items.reduce((sum,x)=>sum+x.equipmentTotalCents,0),
    equipmentLinkedLaborCents:items.reduce((sum,x)=>sum+x.soldLaborCents,0)};
  }catch{return held('source_query_or_validation_failed');}
 };
}
