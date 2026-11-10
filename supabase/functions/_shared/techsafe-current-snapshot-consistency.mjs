// Cross-check the v2 equipment snapshot against the MJV current canonical
// line items observed in the private approved-order preflight. This is a
// necessary consistency check, NOT original-approval or delivery authority.
const held=reason=>({valid:false,reason});
const cents=value=>{if(typeof value!=='string'&&typeof value!=='number')return null;
 const m=/^(0|[1-9]\\d{0,13})(?:\\.(\\d{1,2}))?$/.exec(String(value));
 if(!m)return null;const n=BigInt(m[1])*100n+BigInt((m[2]||'').padEnd(2,'0'));
 return n<=BigInt(Number.MAX_SAFE_INTEGER)?Number(n):null;};
export function validateTechsafeCurrentEquipmentSnapshot(source,snapshot){
 if(!source||!Array.isArray(source.lines)||!snapshot||!Array.isArray(snapshot.lines))
  return held('snapshot_source_missing');
 const rows=new Map();
 for(const l of source.lines){
  if(!l||typeof l.id!=='string'||rows.has(l.id))return held('duplicate_or_invalid_source_line');
  rows.set(l.id,l);
 }
 const seen=new Set();
 for(const l of snapshot.lines){
  if(!l||typeof l.sourceLineId!=='string'||seen.has(l.sourceLineId))return held('duplicate_snapshot_line');
  seen.add(l.sourceLineId);
  if(l.productKind!=='equipment')continue;
  const row=rows.get(l.sourceLineId);
  if(!row||row.product_id!==l.productRef||row.is_customer_supplied===true||
     row.product_organization_id!==source.binding.organization_id)
   return held('equipment_source_binding_mismatch');
  if(!['material','both'].includes(row.item_type)||row.catalog_item_type!=='material')
   return held('equipment_classification_unverified');
  if(l.scope!==(row.is_hidden===true?'removed':'included'))
   return held('equipment_scope_mismatch');
  const count=Number(row.quantity),price=cents(row.unit_price);
  if(!Number.isSafeInteger(count)||count<0||count>10000||price===null||
     l.quantity!==count||l.unitEquipmentValueCents!==price)
   return held('equipment_price_or_quantity_mismatch');
 }
 // Fail closed if an eligible material row was silently omitted. Explicit
 // exclusions need their own independently verified source evidence.
 for(const row of rows.values()){
  if(row.product_id&&['material','both'].includes(row.item_type)&&
    row.catalog_item_type==='material'&&row.is_hidden!==true&&
    row.is_customer_supplied!==true&&!seen.has(row.id))
   return held('eligible_equipment_omitted');
 }
 return {valid:true,reason:null};
}
