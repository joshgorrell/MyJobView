// Diagnostic assessment of trusted private-reader output, not client JSON auth.
// A current receipt does not by itself prove intended equipment membership.
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const ordinal=v=>typeof v==='string'&&/^[1-9]\d{0,18}$/.test(v)&&BigInt(v)<=9223372036854775807n;
export function assessApplicationEvidence(model,binding){
 const result={applicationEvidenceCurrent:false,issues:[],scopeVerified:false,snapshotReady:false,quoteReady:false};
 const issue=(code,changeOrderId)=>result.issues.push(changeOrderId?{changeOrderId,code}:{code});
 if(model===null){issue('source_unavailable');return result;}
 if(!object(model)||model.readModelVersion!==1||!object(model.order)||!object(binding)
  ||!id(binding.connectionId)||!id(binding.organizationId)||!id(binding.orderId)||!id(binding.proposalId)
  ||model.connectionId!==binding.connectionId||model.organizationId!==binding.organizationId
  ||model.order.id!==binding.orderId||model.order.organization_id!==binding.organizationId||model.order.proposal_id!==binding.proposalId){issue('source_binding_mismatch');return result;}
 if(!Array.isArray(model.changeOrders)||model.changeOrders.length>1000||!Array.isArray(model.observations)||model.observations.length>1000
  ||!object(model.equipmentEvidence)||model.equipmentEvidence.version!==2||!hash(model.equipmentEvidence.scopeHash)
  ||!Array.isArray(model.equipmentEvidence.inputs)||model.equipmentEvidence.inputs.length>1000){issue('equipment_evidence_unavailable');return result;}
 const changes=new Map(),inputs=new Map(),receipts=new Map(),ordinals=new Set(),ids=new Set();
 for(const change of model.changeOrders){
  if(!object(change)||!id(change.id)||changes.has(change.id)||change.organization_id!==binding.organizationId||change.sales_order_id!==binding.orderId){issue('invalid_change_binding');return result;}
  if(!['draft','pending_approval','approved','rejected','completed'].includes(change.status)){issue('unsupported_change_state',change.id);return result;}
  changes.set(change.id,change);
 }
 for(const input of model.equipmentEvidence.inputs){
  if(!object(input)||!changes.has(input.changeOrderId)||inputs.has(input.changeOrderId)||!hash(input.inputHash)){issue('invalid_change_input_evidence');return result;}
  inputs.set(input.changeOrderId,input.inputHash);
 }
 if(inputs.size!==changes.size){issue('missing_change_input_evidence');return result;}
 for(const receipt of model.observations){
  if(!object(receipt)||!id(receipt.id)||!id(receipt.changeOrderId)||ids.has(receipt.id)||receipt.connectionId!==binding.connectionId||typeof receipt.completed!=='boolean'){
   issue('invalid_observation');return result;
  }
  ids.add(receipt.id);
  if(!changes.has(receipt.changeOrderId)){issue('orphaned_observation',receipt.changeOrderId);continue;}
  // Old receipts stay diagnostics only. No hash/sequence defaults or backfill.
  if(receipt.equipmentInputHash===null||receipt.equipmentInputHash===undefined){
   if([receipt.equipmentStartedOrder,receipt.equipmentCompletedOrder,receipt.equipmentAfterScopeHash].some(x=>x!==null&&x!==undefined)){issue('invalid_equipment_observation',receipt.changeOrderId);return result;}
   continue;
  }
  if(!hash(receipt.equipmentInputHash)||!ordinal(receipt.equipmentStartedOrder)){issue('invalid_equipment_observation',receipt.changeOrderId);return result;}
  if(ordinals.has(receipt.equipmentStartedOrder)){issue('duplicate_evidence_order');return result;}ordinals.add(receipt.equipmentStartedOrder);
  if(receipt.completed){
   if(!hash(receipt.equipmentAfterScopeHash)||!ordinal(receipt.equipmentCompletedOrder)||BigInt(receipt.equipmentCompletedOrder)<=BigInt(receipt.equipmentStartedOrder)
    ||ordinals.has(receipt.equipmentCompletedOrder)){issue('invalid_equipment_observation',receipt.changeOrderId);return result;}
   ordinals.add(receipt.equipmentCompletedOrder);
  }else if(receipt.equipmentCompletedOrder!==null&&receipt.equipmentCompletedOrder!==undefined){issue('invalid_equipment_observation',receipt.changeOrderId);return result;}
  if(!receipts.has(receipt.changeOrderId))receipts.set(receipt.changeOrderId,[]);
  receipts.get(receipt.changeOrderId).push(receipt);
 }
 const completed=[...receipts.values()].flat().filter(x=>x.completed);
 const latest=completed.reduce((last,row)=>last===null||BigInt(row.equipmentCompletedOrder)>BigInt(last.equipmentCompletedOrder)?row:last,null);
 const required=[...changes.values()].filter(x=>['approved','completed'].includes(x.status));
 if(!required.length){issue('original_scope_basis_required');return result;}
 for(const change of required){
  const matching=(receipts.get(change.id)??[]).filter(x=>x.equipmentInputHash===inputs.get(change.id));
  if(!matching.some(x=>x.completed))issue('matching_application_missing',change.id);
  if(matching.some(x=>!x.completed&&(!latest||BigInt(x.equipmentStartedOrder)>BigInt(latest.equipmentCompletedOrder))))issue('application_incomplete',change.id);
 }
 if(!latest)issue('completed_equipment_observation_missing');
 else{
  if(latest.equipmentInputHash!==inputs.get(latest.changeOrderId))issue('latest_application_inputs_changed',latest.changeOrderId);
  if(latest.equipmentAfterScopeHash!==model.equipmentEvidence.scopeHash)issue('equipment_changed_since_application');
 }
 result.applicationEvidenceCurrent=result.issues.length===0;
 // Separate baseline, action semantics, exclusions/net pricing and freshness
 // verification are still required. This assessment never authorizes a quote.
 return result;
}
