// Diagnostic composition only: reuse existing MJV approval-baseline and
// standalone unit-price verifiers, without reconstructing change orders.
import {assessApprovedRowsConnection} from '../../../supabase/functions/_shared/techsafe-approved-rows-connection.mjs';
import {resolveStandaloneSellingPrice} from '../../../supabase/functions/_shared/techsafe-unit-selling-price.mjs';
const hold=(reason,details={})=>Object.freeze({ok:false,authorized:false,snapshotReady:false,quoteReady:false,reason,...details});
export function inspectMjvApprovedBasisAndPrices({basis,currentModel,pairs,binding,priceRows}={}){
 try{
  if(!binding||!currentModel||!Array.isArray(pairs)||!Array.isArray(priceRows))return hold('approval_or_price_source_missing');
  const approved=assessApprovedRowsConnection({basis,currentModel,pairs},binding);
  if(approved.approvedRowsConnected!==true)return hold('approved_rows_not_connected',{issues:approved.issues});
  if(!Array.isArray(currentModel.lines)||priceRows.length!==currentModel.lines.length)return hold('price_line_coverage_incomplete');
  const ids=new Set(),resolved=[];
  for(const item of priceRows){
   const lineId=item?.row?.line?.id;
   if(typeof lineId!=='string'||ids.has(lineId))return hold('price_line_coverage_incomplete');
   ids.add(lineId);
   const matched=currentModel.lines.find(x=>x?.line?.id===lineId);
   if(!matched||matched.line.organization_id!==item.row.line.organization_id||
      matched.line.proposal_id!==item.row.line.proposal_id||
      String(matched.unitSalePrice)!==String(item.row.unitSalePrice))return hold('price_line_source_mismatch');
   const price=resolveStandaloneSellingPrice(item,binding);
   if(price.salesPriceResolved!==true)return hold('unit_selling_price_unverified',{issues:price.issues});
   resolved.push(Object.freeze({sourceLineId:lineId,unitEquipmentValueCents:price.unitEquipmentValueCents}));
  }
  if(currentModel.lines.some(x=>!ids.has(x?.line?.id)))return hold('price_line_coverage_incomplete');
  // Connected approval rows and resolved unit prices are NOT sufficient for
  // initial sold membership, receipt provenance, completeness or freshness.
  return Object.freeze({ok:true,authorized:false,snapshotReady:false,quoteReady:false,
   reason:'approval_rows_and_prices_inspected_scope_unverified',
   connectionMode:approved.connectionMode,checkedApplications:approved.checkedApplications,
   resolvedPrices:Object.freeze(resolved),originalScopeVerified:false,scopeVerified:false});
 }catch{return hold('approval_price_inspection_failed');}
}
