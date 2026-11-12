// Map the CURRENT approved MJV Sales Order to Techsafe's product/labor facts.
// MJV owns proposal approvals and applies approved change orders itself.
// This projection is data only; it cannot grant dispatch authority.
const integer=x=>Number.isSafeInteger(x)&&x>=0;
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x);
const held=(reason,issues=[])=>({ok:false,reason,issues,authorized:false,snapshotReady:false});
export function projectCurrentSalesOrderForTechsafe(source,{minimumUnitValueCents}={}){
 if(!source||source.ok!==true||source.source!=='current_approved_sales_order'||
    !Array.isArray(source.equipment)||!integer(source.soldLaborCents)||
    !integer(minimumUnitValueCents))
  return held('current_sales_order_source_unavailable');
 const issues=Array.isArray(source.issues)?source.issues:[{reason:'source_issues_unavailable'}];
 // A read problem is a technical hold, NOT an incomplete Sales Order.
 if(issues.length)return held('source_field_mapping_needs_attention',issues);
 const lines=[],seen=new Set();
 for(const item of source.equipment){
  if(!item||!id(item.sourceLineId)||!id(item.productRef)||
     !Number.isSafeInteger(item.quantity)||item.quantity<1||item.quantity>10000||
     !integer(item.unitSalePriceCents)||!integer(item.lineSaleTotalCents)||
     seen.has(item.sourceLineId))
   return held('source_product_mapping_invalid');
  seen.add(item.sourceLineId);
  // Unit SELLING price, never line extension or catalog price.
  // Preserve below-minimum rows in the receiver snapshot: Techsafe applies
  // the dealer's threshold without losing context on source refresh.
  lines.push(Object.freeze({sourceLineId:item.sourceLineId,productRef:item.productRef,
   productKind:'equipment',scope:'included',customerSupplied:false,
   techsafeExcluded:false,quantity:item.quantity,
   unitEquipmentValueCents:item.unitSalePriceCents}));
 }
 return Object.freeze({ok:true,authorized:false,snapshotReady:false,
  reason:'source_projection_requires_trusted_delivery_authority',
  lines:Object.freeze(lines),soldLaborCents:source.soldLaborCents,
  minimumUnitValueCents,qualifyingProductCount:lines.filter(x=>x.unitEquipmentValueCents>=minimumUnitValueCents).length,
  sourceLineCount:lines.length,noChangeOrderReplay:true});
}
