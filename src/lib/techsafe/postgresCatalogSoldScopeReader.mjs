import {reconcileTechsafeApprovedScope} from './reconcileApprovedScope.mjs';
import {normalizeSoldEquipmentItems} from './normalizeSoldEquipmentItems.mjs';
// Read-only source inspection; never authorizes delivery or repairs legacy rows.
const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(x);
const held=reason=>({ready:false,reason,items:[]});
export function createTechsafeCatalogSoldScopeReader(client){
 if(!client||typeof client.query!=='function')throw TypeError('trusted_postgres_client_required');
 return async({connectionId,orderId,minimumEligibleUnitPrice}={})=>{
  if(!uuid(connectionId)||!uuid(orderId))return held('invalid_binding');
  if(!Number.isFinite(Number(minimumEligibleUnitPrice))||Number(minimumEligibleUnitPrice)<=0)return held('dealer_eligibility_minimum_required');
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
   // Read all approved changes, including additions that have no committed line.
   const changes=await client.query(`SELECT li.id,li.action_type AS "actionType",
     li.proposal_line_item_id AS "sourceLineId",li.remove_scope AS "removeScope",
     li.original_quantity AS "originalQuantity",li.new_quantity AS "newQuantity",
     co.is_locked AS "locked",co.is_active AS "active"
    FROM public.change_orders co
    JOIN public.change_order_line_items li ON li.change_order_id=co.id
     AND li.organization_id=co.organization_id
    WHERE co.sales_order_id=$1 AND co.organization_id=$2 AND co.status='approved'
    ORDER BY co.created_at,li.sort_order,li.id`,[orderId,c.organization_id]);
   if(changes.rows.some(row=>row.locked!==true||row.active!==false))return held('approved_change_not_committed');
   const result=await client.query(`SELECT pli.id,pli.product_id AS "productId",
     pli.description,pli.quantity,pli.unit_price AS "unitPrice",
     CASE WHEN COALESCE(pli.item_type,'part')='labor'\n       THEN COALESCE(pli.labor_total,pli.line_total,0)\n       ELSE COALESCE(pli.labor_total,0) END AS "soldLabor",
     pli.committed_change_order_line_id AS "committedChangeLineId",
     COALESCE(pli.is_customer_supplied,false) AS "customerSupplied",
     (COALESCE(pli.item_type,'part')='labor') AS "laborOnly",
     (pr.id IS NOT NULL AND pr.company_id=pr_source.company_id) AS "catalogOwned",
     (lower(pr.name)='miscellaneous item') AS "isMisc"
     FROM public.proposal_line_items pli
     JOIN public.proposals pr_source ON pr_source.id=pli.proposal_id AND pr_source.organization_id=pli.organization_id
     LEFT JOIN public.products pr ON pr.id=pli.product_id
     WHERE pli.proposal_id=$1 AND pli.organization_id=$2
     ORDER BY pli.id`,[c.proposal_id,c.organization_id]);
   const sourceLines=result.rows;
   const scope=reconcileTechsafeApprovedScope({sourceLines,approvedChanges:changes.rows,
     minimumEligibleUnitPrice});
   if(!scope.certifiable)return held(scope.reason);
   const included=new Set(scope.items.map(row=>row.id));
   const items=normalizeSoldEquipmentItems(sourceLines.filter(row=>included.has(row.id)).map(row=>({
     lineId:row.id,productId:row.productId,description:row.description,quantity:row.quantity,
     unitPrice:row.unitPrice,soldLabor:row.soldLabor,isMisc:row.isMisc,minimumEligibleUnitPrice
   })));
   return {ready:true,reason:null,items,soldLaborTotalCents:scope.soldLaborCents,
    removedSourceLineIds:scope.removedLineIds,eligibleItems:items.filter(x=>x.eligibleByUnitMinimum),
    equipmentCents:scope.equipmentCents,
    equipmentLinkedLaborCents:items.reduce((sum,x)=>sum+x.soldLaborCents,0)};
  }catch{return held('source_query_or_validation_failed');}
 };
}
