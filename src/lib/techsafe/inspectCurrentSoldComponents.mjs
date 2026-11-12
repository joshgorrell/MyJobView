// Inspect SOLD current Sales Order money, not product catalog prices.
// Read-only diagnostic: this does not decide coverage, certify membership,
// replay change orders, or grant any Techsafe transport authority.
const hold=reason=>Object.freeze({ok:false,authorized:false,snapshotReady:false,reason});
const cents=n=>Number.isSafeInteger(n)&&n>=0&&n<=999999999999999;
const count=n=>Number.isSafeInteger(n)&&n>=0&&n<=10000;
export function inspectCurrentSoldComponents({baseLines,history}={}){
 if(!Array.isArray(baseLines)||!count(baseLines.length)||!history||
    history.ok!==true||history.historyCompletenessCertified!==false)
  return hold('sold_component_input_unverified');
 let equipmentLines=0,laborLines=0,unresolvedLines=0,
  materialSoldCents=0,laborSoldCents=0;
 const issues=[];
 for(const line of baseLines){
  if(!line||typeof line.id!=='string'||!count(line.quantity)||
    (line.productId!==null&&typeof line.productId!=='string'))
   return hold('sold_component_row_invalid');
  // Do not silently convert nulls to zero or infer sold labor from hours.
  const resolved=cents(line.unitSalePriceCents)&&cents(line.lineSaleTotalCents)&&
    cents(line.laborSaleTotalCents);
  if(!resolved){
   unresolvedLines++;
   issues.push({lineId:line.id,reason:'sold_amount_unresolved'});
   continue;
  }
  if(line.hidden!==false||line.customerSupplied!==false){
   issues.push({lineId:line.id,reason:'line_eligibility_unverified'});
   unresolvedLines++;
   continue;
  }
  // Sold labor is independently recorded even on material rows.
  // Count it before material reconciliation; do not lose it when a line
  // contains an unresolved discount, bundle, or embedded labor amount.
  if(line.laborSaleTotalCents>0||line.itemType==='labor')laborLines++;
  laborSoldCents+=line.laborSaleTotalCents;
  if(!Number.isSafeInteger(laborSoldCents))return hold('sold_component_total_overflow');
  if(line.productId!==null){
   equipmentLines++;
   // Do not treat line_total as material alone: mixed item lines can include labor.
   // The authoritative material/labor split remains unverified until resolved.
   if(line.itemType==='both'||line.itemType===null){
    issues.push({lineId:line.id,reason:'mixed_sold_split_unverified'});
    unresolvedLines++;
    continue;
   }
   if(line.itemType==='material'){
    if(line.lineSaleTotalCents!==line.unitSalePriceCents*line.quantity){
     const extended=line.unitSalePriceCents*line.quantity;
     const reason=line.lineSaleTotalCents===extended+line.laborSaleTotalCents
      ?'extended_total_includes_labor'
      :line.lineSaleTotalCents<extended
       ?'discount_or_credit_requires_allocation'
       :'sold_extended_total_requires_allocation';
     issues.push({lineId:line.id,reason});
     unresolvedLines++;
     continue;
    }
    materialSoldCents+=line.lineSaleTotalCents;
   }
  }
  if(!Number.isSafeInteger(materialSoldCents))
   return hold('sold_component_total_overflow');
 }
 const blockers=new Set();
 if(unresolvedLines)blockers.add('sold_component_lines_unresolved');
 if(history.needsHistoricalReconciliation===true)blockers.add('change_history_reconciliation_required');
 if(history.needsHistoricalReconciliation!==false)blockers.add('change_history_state_unverified');
 blockers.add('original_approved_line_membership_unverified');
 blockers.add('complete_historical_application_evidence_unverified');
 return Object.freeze({ok:true,authorized:false,snapshotReady:false,
  reason:'sold_components_inspected_not_source_certified',
  equipmentLines,laborLines,unresolvedLines,
  materialSoldCents,laborSoldCents,
  issues:Object.freeze(issues),blockers:Object.freeze([...blockers]),
  originalApprovedMembershipCertified:false,sourceManifestComplete:false});
}
