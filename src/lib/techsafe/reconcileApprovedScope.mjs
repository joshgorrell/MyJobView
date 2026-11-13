// Pure pre-certification gate: approved changes must be accounted for, never guessed.
// This function does not mutate an order, issue a certificate or enable imports.
const id=x=>typeof x==='string'&&/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(x);
const cents=x=>{const n=Number(x);return x===null||x===undefined||!Number.isFinite(n)||n<0?null:Math.round(n*100)};
const held=(reason,details=[])=>Object.freeze({certifiable:false,reason,details});
export function reconcileTechsafeApprovedScope({sourceLines,approvedChanges,minimumEligibleUnitPrice}={}){
 if(!Array.isArray(sourceLines)||!Array.isArray(approvedChanges)||cents(minimumEligibleUnitPrice)===null||Number(minimumEligibleUnitPrice)<=0)return held('invalid_reconciliation_input');
 const source=new Map();
 for(const line of sourceLines){
  if(!id(line.id)||source.has(line.id)||(!line.laborOnly&&(!id(line.productId)||line.catalogOwned!==true))||!Number.isSafeInteger(Number(line.quantity))||Number(line.quantity)<=0||cents(line.unitPrice)===null||cents(line.soldLabor)===null)return held('invalid_source_line',[line.id]);
  source.set(line.id,line);
 }
 const removed=new Set(),committedAdditions=new Set();
 for(const change of approvedChanges){
  if(!id(change.id))return held('invalid_approved_change_id');
  if(change.actionType==='add'){
   const matching=sourceLines.filter(line=>line.committedChangeLineId===change.id);
   if(matching.length!==1||(!matching[0].laborOnly&&(!id(matching[0].productId)||matching[0].catalogOwned!==true)))return held('approved_addition_unreconciled',[change.id]);
   if(committedAdditions.has(matching[0].id))return held('duplicate_committed_addition',[change.id]);
   committedAdditions.add(matching[0].id);
  }else if(change.actionType==='remove'){
   const line=source.get(change.sourceLineId);
   if(!line||removed.has(line.id)||change.removeScope!=='parts_and_labor'||Number(change.newQuantity)!==0||Number(change.originalQuantity)!==Number(line.quantity))return held('approved_removal_unreconciled',[change.id]);
   removed.add(line.id);
  }else return held('unsupported_approved_change',[change.id]);
 }
 // A source line claiming to be a committed addition must have an approved source change.
 const approvedAdditionIds=new Set(approvedChanges.filter(x=>x.actionType==='add').map(x=>x.id));
 for(const line of sourceLines)if(line.committedChangeLineId&&!approvedAdditionIds.has(line.committedChangeLineId))return held('orphan_committed_addition',[line.id]);
 const items=sourceLines.filter(line=>!removed.has(line.id));
 const equipment=items.filter(line=>!line.customerSupplied&&!line.laborOnly);
 // Labor-only and customer-supplied lines contribute labor but never equipment eligibility.
 const eligible=equipment.filter(line=>Number(line.unitPrice)>=Number(minimumEligibleUnitPrice));
 return Object.freeze({certifiable:true,reason:null,removedLineIds:[...removed],items:equipment,eligibleItems:eligible,
  equipmentCents:equipment.reduce((s,x)=>s+cents(x.unitPrice)*Number(x.quantity),0),
  soldLaborCents:items.reduce((s,x)=>s+cents(x.soldLabor),0)});
}
