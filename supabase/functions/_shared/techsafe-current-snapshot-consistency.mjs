// Cross-check the v2 equipment snapshot against the MJV current canonical
// line items observed in the private approved-order preflight. This is a
// necessary consistency check, NOT original-approval or delivery authority.
const held=reason=>({valid:false,reason});
const isEquipment=row=>['material','both'].includes(row.item_type)&&
 (row.product_id===null?row.item_type==='material':row.catalog_item_type==='material');
const productRef=row=>row.product_id??`line_${row.id}`;
const cents=value=>{if(typeof value!=='string'&&typeof value!=='number')return null;
 const m=/^(0|[1-9]\d{0,13})(?:\.(\d{1,2}))?$/.exec(String(value));
 if(!m)return null;const n=BigInt(m[1])*100n+BigInt((m[2]||'').padEnd(2,'0'));
 return n<=BigInt(Number.MAX_SAFE_INTEGER)?Number(n):null;};
export function validateTechsafeCurrentEquipmentSnapshot(source,snapshot){
 if(!source||!Array.isArray(source.lines)||!snapshot||!Array.isArray(snapshot.lines))
  return held('snapshot_source_missing');
 const rows=new Map();
 for(const l of source.lines){
  if(!l||typeof l.id!=='string'||rows.has(l.id))return held('duplicate_or_invalid_source_line');
  if(typeof l.approved_removed!=='boolean'||(l.approved_removed&&l.is_hidden!==true))
   return held('approved_removal_evidence_unverified');
  rows.set(l.id,l);
 }
 const seen=new Set();
 for(const l of snapshot.lines){
  if(!l||typeof l.sourceLineId!=='string'||seen.has(l.sourceLineId))return held('duplicate_snapshot_line');
  seen.add(l.sourceLineId);
  // Every line, including non-equipment, must correspond to a canonical
  // source line. A fabricated labor/misc row is not a harmless extra.
  const row=rows.get(l.sourceLineId);
  if(!row)return held('snapshot_line_not_in_source');
  if(l.productKind!=='equipment'){
   if(isEquipment(row)&&!row.approved_removed&&row.is_customer_supplied!==true)
    return held('eligible_equipment_reclassified');
   if(l.productRef!==null&&l.productRef!==row.product_id)
    return held('non_equipment_product_mismatch');
   continue;
  }
  if(productRef(row)!==l.productRef||row.is_customer_supplied===true||
     (row.product_id!==null&&row.product_organization_id!==source.binding.organization_id))
   return held('equipment_source_binding_mismatch');
  if(!isEquipment(row))
   return held('equipment_classification_unverified');
  if(row.product_id===null&&(typeof row.description!=='string'||!row.description.trim()||
     row.description.length>4000||l.description!==row.description))
   return held('manual_equipment_description_mismatch');
  if(l.customerSupplied!==false||l.techsafeExcluded!==false)
   return held('equipment_exclusion_flag_mismatch');
  if(l.scope!==(row.approved_removed?'removed':'included'))
   return held('equipment_scope_mismatch');
  const count=Number(row.quantity),price=cents(row.unit_price);
  if(!Number.isSafeInteger(count)||count<0||count>10000||price===null||
     l.quantity!==count||l.unitEquipmentValueCents!==price)
   return held('equipment_price_or_quantity_mismatch');
 }
 // Fail closed if an eligible material row was silently omitted. Explicit
 // exclusions need their own independently verified source evidence.
 for(const row of rows.values()){
  if(isEquipment(row)&&!row.approved_removed&&
    row.is_customer_supplied!==true&&!seen.has(row.id))
   return held('eligible_equipment_omitted');
 }
 return {valid:true,reason:null};
}
