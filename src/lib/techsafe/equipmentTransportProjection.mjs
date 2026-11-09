// Deterministic, fail-closed equipment projection for a previously reconciled
// approved Sales Order. This is NOT source certification or dispatch authority.
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x);
const money=x=>Number.isSafeInteger(x)&&x>=0;
const fail=reason=>({ok:false,authorized:false,snapshotReady:false,reason,lines:[]});
export function projectTechsafeEquipment({inspection,details,minimumUnitValueCents=0}={}){
 if(inspection?.ok!==true||inspection.authorized!==false||inspection.snapshotReady!==false||
  !Number.isSafeInteger(inspection.revision)||inspection.revision<1||!Array.isArray(inspection.items))
  return fail('approved_source_inspection_required');
 if(!money(minimumUnitValueCents))return fail('invalid_equipment_minimum');
 if(!Array.isArray(details)||details.length!==inspection.items.length||details.length>10000)
  return fail('equipment_details_incomplete');
 const byId=new Map();
 for(const detail of details){
  if(!detail||!id(detail.sourceLineId)||byId.has(detail.sourceLineId)||
   !id(detail.productRef)||typeof detail.description!=='string'||detail.description.length>4000||
   !money(detail.unitEquipmentValueCents)||typeof detail.customerSupplied!=='boolean'||
   typeof detail.techsafeExcluded!=='boolean'||detail.productKind!=='equipment')
   return fail('invalid_equipment_detail');
  byId.set(detail.sourceLineId,detail);
 }
 const lines=[];let total=0;
 for(const item of inspection.items){
  if(!item||!id(item.productId)||!id(item.sourceLineId)&&
   !(typeof item.sourceLineId==='string'&&item.sourceLineId.startsWith('change:')&&id(item.sourceLineId.slice(7)))||
   !Number.isSafeInteger(item.quantity)||item.quantity<1||item.quantity>10000)
   return fail('invalid_reconciled_equipment');
  const detail=byId.get(item.sourceLineId);
  if(!detail||detail.productRef!==item.productId)return fail('equipment_identity_mismatch');
  // Techsafe draft receiver accepts eligible equipment only. Keep the
  // complete reconciled source separately for audit/certification; do not
  // represent this filtered draft payload as an exhaustive source snapshot.
  const line={sourceLineId:item.sourceLineId,productRef:detail.productRef,productKind:'equipment',
   scope:'included',customerSupplied:detail.customerSupplied,techsafeExcluded:detail.techsafeExcluded,
   quantity:item.quantity,unitEquipmentValueCents:detail.unitEquipmentValueCents,description:detail.description};
  total+=line.quantity*line.unitEquipmentValueCents;
  if(!Number.isSafeInteger(total))return fail('equipment_value_overflow');
  if(!line.customerSupplied&&!line.techsafeExcluded&&line.unitEquipmentValueCents>=minimumUnitValueCents)
   lines.push(line);
 }
 return {ok:true,authorized:false,snapshotReady:false,reason:'projection_not_certified',revision:inspection.revision,lines};
}
