// Diagnostic composition only: reuse existing MJV approval-baseline and
// standalone unit-price verifiers, without reconstructing change orders.
import {assessApprovedRowsConnection} from '../../../supabase/functions/_shared/techsafe-approved-rows-connection.mjs';
import {resolveStandaloneSellingPrice} from '../../../supabase/functions/_shared/techsafe-unit-selling-price.mjs';
import {salesPriceToCents} from '../../../supabase/functions/_shared/techsafe-sales-equipment.mjs';
const hold=(reason,details={})=>Object.freeze({ok:false,authorized:false,snapshotReady:false,quoteReady:false,reason,...details});
export function inspectMjvApprovedBasisAndPrices({basis,currentModel,pairs,binding,priceRows}={}){
 try{
  if(!binding||!currentModel||!Array.isArray(pairs)||!Array.isArray(priceRows))return hold('approval_or_price_source_missing');
  const approved=assessApprovedRowsConnection({basis,currentModel,pairs},binding);
  if(approved.approvedRowsConnected!==true)return hold('approved_rows_not_connected',{issues:approved.issues});
  if(!Array.isArray(currentModel.lines)||priceRows.length!==currentModel.lines.length)return hold('price_line_coverage_incomplete');
  const ids=new Set(),resolved=[];
  const currentById=new Map();
  for(const entry of currentModel.lines){
   const id=entry?.line?.id;
   if(typeof id!=='string'||!id||currentById.has(id))return hold('price_line_coverage_incomplete');
   currentById.set(id,entry);
  }
  for(const item of priceRows){
   const lineId=item?.row?.line?.id;
   if(typeof lineId!=='string'||ids.has(lineId))return hold('price_line_coverage_incomplete');
   ids.add(lineId);
   const matched=currentById.get(lineId);
   if(!matched||!matched.line||!item.row.line||
      matched.line.organization_id!==item.row.line.organization_id||
      matched.line.proposal_id!==item.row.line.proposal_id||
      matched.line.product_id!==item.row.line.product_id||
      matched.line.item_type!==item.row.line.item_type||
      matched.line.is_customer_supplied!==item.row.line.is_customer_supplied||
      matched.line.is_hidden!==item.row.line.is_hidden||
      matched.line.description!==item.row.line.description||
      String(matched.line.quantity)!==String(item.row.line.quantity))return hold('price_line_source_mismatch');
   try{
    if(salesPriceToCents(matched.unitSalePrice)!==salesPriceToCents(item.row.unitSalePrice))
     return hold('price_line_source_mismatch');
   }catch{return hold('price_line_source_mismatch');}
   const price=resolveStandaloneSellingPrice(item,binding);
   if(price.salesPriceResolved!==true)return hold('unit_selling_price_unverified',{issues:price.issues});
   resolved.push(Object.freeze({sourceLineId:lineId,unitEquipmentValueCents:price.unitEquipmentValueCents}));
  }
  if(currentById.size!==ids.size||currentModel.lines.some(x=>!ids.has(x?.line?.id)))return hold('price_line_coverage_incomplete');
  // Connected approval rows and resolved unit prices are NOT sufficient for
  // initial sold membership, receipt provenance, completeness or freshness.
  return Object.freeze({ok:true,authorized:false,snapshotReady:false,quoteReady:false,
   reason:'approval_rows_and_prices_inspected_scope_unverified',
   connectionMode:approved.connectionMode,checkedApplications:approved.checkedApplications,
   resolvedPrices:Object.freeze(resolved),originalScopeVerified:false,scopeVerified:false});
 }catch{return hold('approval_price_inspection_failed');}
}
