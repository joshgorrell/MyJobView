// Techsafe draft refresh policy: equipment follows the committed MJV Sales Order;
// dealer-entered labor coverage belongs to the Techsafe draft, not MJV.
// Pure, inspection-only helper. No writes, network, or coverage activation.
const validCents=n=>Number.isSafeInteger(n)&&n>=0;
const held=reason=>({ok:false,reason,lines:[],authorized:false});
export function reconcileTechsafeDraftLabor({incomingLines,existingDraft,minimumUnitValueCents}={}){
 if(!Array.isArray(incomingLines)||incomingLines.length>10000||
    !validCents(minimumUnitValueCents))return held('invalid_source_lines_or_minimum');
 if(existingDraft!=null&&(!['draft','purchased','active','cancelled'].includes(existingDraft.lifecycle)||
   !Array.isArray(existingDraft.lines)))return held('draft_state_unverified');
 if(existingDraft&&existingDraft.lifecycle!=='draft')return held('purchased_or_active_plan_immutable');
 const previous=new Map();
 for(const line of existingDraft?.lines??[]){
  if(typeof line?.sourceLineId!=='string'||previous.has(line.sourceLineId))return held('existing_draft_line_invalid');
  previous.set(line.sourceLineId,line);
 }
 const output=[],seen=new Set();
 for(const line of incomingLines){
  if(typeof line?.sourceLineId!=='string'||seen.has(line.sourceLineId)||
     !['equipment','labor'].includes(line.productKind)||
     !validCents(line.unitEquipmentValueCents)||!Number.isSafeInteger(line.quantity)||line.quantity<0||line.quantity>10000)
   return held('source_line_invalid');
  seen.add(line.sourceLineId);
  if(line.productKind==='equipment'){
   if(line.unitEquipmentValueCents<minimumUnitValueCents)return held('source_equipment_below_dealer_minimum');
   output.push(Object.freeze({...line}));continue;
  }
  const old=previous.get(line.sourceLineId);
  if(old&&old.productKind!=='labor')return held('draft_line_kind_conflict');
  if(old&&old.dealerLaborOverrideCents!==undefined&&old.dealerLaborOverrideCents!==null&&!validCents(old.dealerLaborOverrideCents))
   return held('invalid_dealer_labor_override');
  // Preserve the explicit dealer override, including zero, on draft refresh.
  // Without one, imported labor always reflects the latest MJV selling value.
  const override=old?.dealerLaborOverrideCents??undefined;
  if(!Number.isSafeInteger(line.quantity*line.unitEquipmentValueCents))return held('labor_value_overflow');
  output.push(Object.freeze({...line,
   // Source reference is always current, even after a dealer override.
   mjvSalesOrderLaborCents:line.quantity*line.unitEquipmentValueCents,
   dealerLaborCoverageCents:override===undefined?line.quantity*line.unitEquipmentValueCents:override,
   dealerLaborOverrideCents:override===undefined?null:override}));
 }
 return {ok:true,reason:'draft_labor_reconciled_not_authorized',authorized:false,
  lines:Object.freeze(output)};
}
