// Deterministic diagnostic fingerprint of the current MJV Sales Order rows.
// Not an approval certificate, authorization, revision number or dispatch token.
// Only approved current equipment facts affect this digest; drafts are excluded.
const id=v=>typeof v==='string'&&/^[a-f0-9-]{36}$/i.test(v);
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const hold=reason=>({valid:false,reason,fingerprint:null,projection:null});
const money=v=>typeof v==='string'||typeof v==='number'?String(v):null;
export async function fingerprintCurrentSalesOrder({binding,lines,changes}={},digest){
 if(typeof digest!=='function'||!plain(binding)||!id(binding.connection_id)||
  !id(binding.organization_id)||!id(binding.sales_order_id)||!id(binding.proposal_id)||
  !Number.isSafeInteger(Number(binding.connection_generation))||Number(binding.connection_generation)<1||
  !Array.isArray(lines)||!Array.isArray(changes)||lines.length>10000||changes.length>1000)
  return hold('invalid_fingerprint_input');
 const seen=new Set(),selected=[];
 for(const l of lines){
  if(!plain(l)||!id(l.id)||seen.has(l.id)||!id(l.product_id)&&l.product_id!==null||
   l.product_id&&l.product_organization_id!==binding.organization_id||
   !Number.isSafeInteger(Number(l.quantity))||Number(l.quantity)<0||Number(l.quantity)>10000||
   !/^(0|[1-9]\\d{0,13})(?:\\.\\d{1,2})?$/.test(money(l.unit_price)??''))
   return hold('invalid_current_line');
  seen.add(l.id);
  // Preserve hidden/removed rows as tombstones. The receiver can distinguish
  // a removed source line from a line that never existed.
  selected.push({sourceLineId:l.id,productRef:l.product_id,quantity:Number(l.quantity),
   unitPrice:money(l.unit_price),hidden:l.is_hidden===true,customerSupplied:l.is_customer_supplied===true,
   itemType:l.item_type??null,parentItemId:l.parent_item_id??null,displayMode:l.display_mode??null});
 }
 const approved=[];
 for(const c of changes){
  if(!plain(c)||!id(c.id))return hold('invalid_change_identity');
  if(['approved','completed'].includes(c.status)){
   if(c.is_active!==false||!c.approval_date||c.requires_customer_approval===true&&c.customer_approved!==true)
    return hold('approved_change_not_applied');
   approved.push({id:c.id,approvalDate:c.approval_date,updatedAt:c.updated_at??null});
  }else if(!['draft','pending_approval'].includes(c.status))return hold('unknown_change_state');
 }
 selected.sort((a,b)=>a.sourceLineId.localeCompare(b.sourceLineId));
 approved.sort((a,b)=>a.id.localeCompare(b.id));
 const projection={version:1,connectionId:binding.connection_id,organizationId:binding.organization_id,
  orderId:binding.sales_order_id,proposalId:binding.proposal_id,generation:Number(binding.connection_generation),
  lines:selected,appliedChanges:approved};
 let fingerprint;
 try{fingerprint=await digest(JSON.stringify(projection));}catch{return hold('digest_unavailable');}
 if(typeof fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(fingerprint))return hold('digest_invalid');
 return {valid:true,reason:null,fingerprint,projection};
}
