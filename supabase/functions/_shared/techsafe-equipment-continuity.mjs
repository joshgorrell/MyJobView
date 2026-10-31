// Inactive diagnostic for trusted private current reads and SQL-validated pairs.
// No change-order data is transported to Techsafe by this module.
import {assessApplicationEvidence} from './techsafe-application-evidence.mjs';
import {assessEquipmentEffects,equipmentRowsEqual} from './techsafe-equipment-effects.mjs';
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const ordinal=v=>typeof v==='string'&&/^[1-9]\d{0,18}$/.test(v)&&BigInt(v)<=9223372036854775807n;
export function assessEquipmentContinuity(input,binding){
 const result={historyContinuous:false,checkedApplications:0,issues:[],originalScopeVerified:false,scopeVerified:false,snapshotReady:false,quoteReady:false};
 const stop=(code,observationId)=>{throw Object.assign(Error(code),{observationId});};
 try{
  if(!object(input))stop('invalid_continuity_input');
  const {currentModel:model,pairs}=input;
  if(!assessApplicationEvidence(model,binding).applicationEvidenceCurrent)stop('application_evidence_not_current');
  if(!Array.isArray(model.lines)||model.lines.length>10000)stop('invalid_current_equipment');
  if(!Array.isArray(pairs)||pairs.length>1000)stop('invalid_equipment_pairs');
  if(pairs.length!==model.observations.length)stop('application_pairs_incomplete');
  const changes=new Map(model.changeOrders.map(co=>[co.id,co]));
  for(const co of changes.values())if(co.proposal_id!==binding.proposalId)stop('change_proposal_mismatch');
  const inputs=new Map(model.equipmentEvidence.inputs.map(row=>[row.changeOrderId,row.inputHash]));
  const byId=new Map();let rows=model.lines.length;
  for(const pair of pairs){
   if(!object(pair)||!id(pair.observationId)||byId.has(pair.observationId))stop('invalid_pair_identity');
   for(const key of ['beforeLines','afterLines','changeLines']){
    if(!Array.isArray(pair[key])||pair[key].length>10000)stop('invalid_pair_rows',pair.observationId);
    rows+=pair[key].length;
   }
   if(rows>100000)stop('equipment_history_budget_exceeded');
   byId.set(pair.observationId,pair);
  }
  const ordered=[...model.observations].sort((a,b)=>BigInt(a.equipmentStartedOrder??0)<BigInt(b.equipmentStartedOrder??0)?-1:1);
  const seenChanges=new Set();let previous=null;
  for(const receipt of ordered){
   if(!receipt.completed||!ordinal(receipt.equipmentStartedOrder)||!ordinal(receipt.equipmentCompletedOrder)
    ||!hash(receipt.equipmentInputHash)||!hash(receipt.equipmentAfterScopeHash))stop('unverified_application_in_history',receipt.id);
   const pair=byId.get(receipt.id),co=changes.get(receipt.changeOrderId),b=pair?.binding;
   if(!object(pair)||pair.pairVersion!==1||!object(b)||b.connectionId!==binding.connectionId||b.organizationId!==binding.organizationId
    ||b.orderId!==binding.orderId||b.proposalId!==binding.proposalId||b.changeOrderId!==receipt.changeOrderId)stop('pair_binding_mismatch',receipt.id);
   if(!['approved','completed'].includes(co.status))stop('applied_change_no_longer_approved',receipt.id);
   if(seenChanges.has(co.id))stop('repeated_application_requires_review',receipt.id);seenChanges.add(co.id);
   if(!ordinal(pair.transactionId)||pair.transactionId!==receipt.transactionId||pair.startedOrder!==receipt.equipmentStartedOrder
    ||pair.completedOrder!==receipt.equipmentCompletedOrder||pair.equipmentInputHash!==receipt.equipmentInputHash
    ||pair.afterScopeHash!==receipt.equipmentAfterScopeHash||!hash(pair.beforeScopeHash))stop('pair_receipt_mismatch',receipt.id);
   if(pair.equipmentInputHash!==inputs.get(co.id))stop('historical_application_inputs_changed',receipt.id);
   if(!assessEquipmentEffects(pair).equipmentEffectsMatch)stop('application_effects_unverified',receipt.id);
   if(previous){
    if(BigInt(previous.completedOrder)>=BigInt(pair.startedOrder))stop('overlapping_applications',receipt.id);
    if(previous.afterScopeHash!==pair.beforeScopeHash||!equipmentRowsEqual(previous.afterLines,pair.beforeLines,binding))stop('equipment_history_gap',receipt.id);
   }
   previous=pair;
  }
  if(!previous)stop('observed_history_missing');
  if(previous.afterScopeHash!==model.equipmentEvidence.scopeHash||!equipmentRowsEqual(previous.afterLines,model.lines,binding))stop('current_equipment_not_observed');
  result.historyContinuous=true;result.checkedApplications=ordered.length;
  // Only the observed span is checked. Never invent its original scope basis,
  // approval provenance, native commit order, net pricing or checkout freshness.
 }catch(error){result.issues.push(error.observationId?{code:error.message,observationId:error.observationId}:{code:error.message||'invalid_continuity_input'});}
 return result;
}
