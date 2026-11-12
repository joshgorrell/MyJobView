// Inspection-only: detect approved Sales Order labor omitted by the legacy
// equipment-only Techsafe candidate. Never manufacture a price or authorize sync.
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
const held=reason=>({ok:false,reason,authorized:false,snapshotReady:false,labor:[]});
export function inspectApprovedSalesOrderLabor({source}={}){
 if(source?.readModelVersion===1)return held('diagnostic_source_not_authoritative');
 if(!source||source.trustedCurrentOrderRead!==true||source.currentEquipmentComplete!==true||
  source.approvedSalesOrder!==true||!id(source.organizationId)||!id(source.order?.id)||
  !id(source.order?.proposal_id)||source.order.organization_id!==source.organizationId||
  !Array.isArray(source.lines)||source.lines.length>10000)
  return held('approved_order_source_unverified');
 const labor=[],seen=new Set();
 for(const row of source.lines){
  const line=row?.line;
  if(!line||!id(line.id)||seen.has(line.id)||line.organization_id!==source.organizationId||
   line.proposal_id!==source.order.proposal_id)return held('labor_source_identity_unverified');
  seen.add(line.id);
  if(line.item_type!=='labor'&&row.product?.item_type!=='labor')continue;
  if(row.membership?.verified!==true||row.membership.orderId!==source.order.id||
   row.membership.sourceLineId!==line.id||!['included','removed'].includes(row.membership.scope))
   return held('labor_membership_unverified');
  if(row.membership.scope==='removed')continue;
  if(row.salesPriceResolved!==true||!/^\d{1,12}(?:\.\d{1,2})?$/.test(String(row.unitSalePrice))||
   !/^\d{1,5}(?:\.0{1,2})?$/.test(String(line.quantity)))
   return held('labor_selling_price_or_quantity_unverified');
  const quantity=Number(line.quantity);
  const [d,f='']=String(row.unitSalePrice).split('.');
  const cents=BigInt(d)*100n+BigInt(f.padEnd(2,'0'));
  if(!Number.isSafeInteger(quantity)||quantity>10000||cents>BigInt(Number.MAX_SAFE_INTEGER)||
   BigInt(quantity)*cents>BigInt(Number.MAX_SAFE_INTEGER))return held('labor_value_overflow');
  labor.push(Object.freeze({sourceLineId:line.id,productKind:'labor',quantity,
   unitEquipmentValueCents:Number(cents)}));
 }
 return {ok:true,reason:'labor_inspected_not_authorized',authorized:false,snapshotReady:false,labor};
}
