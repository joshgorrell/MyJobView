// Internal diagnostic only. Inputs must come from trusted private SQL readers.
// It connects observed rows; it does not establish sold membership or pricing.
import {assessEquipmentContinuity} from './techsafe-equipment-continuity.mjs';
import {equipmentRowsEqual} from './techsafe-equipment-effects.mjs';
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export function assessApprovedRowsConnection(input,binding){
 const result={approvedRowsConnected:false,connectionMode:null,checkedApplications:0,issues:[],
  originalScopeVerified:false,scopeVerified:false,snapshotReady:false,quoteReady:false};
 const stop=code=>{throw Error(code);};
 try{
  if(!object(input)||!object(binding)||![binding.connectionId,binding.organizationId,binding.orderId,binding.proposalId].every(id))stop('invalid_approved_rows_input');
  const {basis,currentModel:model,pairs}=input,b=basis?.binding;
  if(basis===null||basis===undefined)stop('original_approval_basis_unavailable');
  if(!object(basis)||basis.basisVersion!==1||basis.sourceKind!=='customer_portal_approval'||!object(b)
   ||b.connectionId!==binding.connectionId||b.organizationId!==binding.organizationId||b.orderId!==binding.orderId||b.proposalId!==binding.proposalId)stop('original_basis_binding_mismatch');
  if(!id(basis.approvalRef)||!Number.isInteger(basis.portalVersion)||basis.portalVersion<0||basis.portalVersion>2147483647
   ||typeof basis.approvedAtEpoch!=='string'||!/^\d{1,12}(?:\.\d{1,6})?$/.test(basis.approvedAtEpoch)
   ||!hash(basis.approvedRowsHash)||!Array.isArray(basis.lines)||basis.lines.length>10000)stop('invalid_original_basis');
  if(!object(model)||model.readModelVersion!==1||model.connectionId!==binding.connectionId||model.organizationId!==binding.organizationId
   ||!object(model.order)||model.order.id!==binding.orderId||model.order.organization_id!==binding.organizationId||model.order.proposal_id!==binding.proposalId)stop('current_order_binding_mismatch');
  if(!Array.isArray(model.lines)||model.lines.length>10000||!Array.isArray(model.changeOrders)||model.changeOrders.length>1000
   ||!Array.isArray(model.observations)||model.observations.length>1000||!Array.isArray(pairs)||pairs.length>1000
   ||!object(model.equipmentEvidence)||model.equipmentEvidence.version!==2||!hash(model.equipmentEvidence.scopeHash)
   ||!Array.isArray(model.equipmentEvidence.inputs)||model.equipmentEvidence.inputs.length>1000)stop('invalid_approved_rows_evidence');
  let rows=basis.lines.length+model.lines.length;
  for(const pair of pairs){
   if(!object(pair))stop('invalid_equipment_pairs');
   for(const key of ['beforeLines','afterLines','changeLines']){
    if(!Array.isArray(pair[key])||pair[key].length>10000)stop('invalid_equipment_pairs');rows+=pair[key].length;
   }
  }
  if(rows>100000)stop('approved_rows_budget_exceeded');
  if(model.observations.length||pairs.length){
   const continuity=assessEquipmentContinuity({currentModel:model,pairs},binding);
   if(!continuity.historyContinuous)stop('approved_application_history_not_connected');
   const first=pairs.reduce((a,p)=>a===null||BigInt(p.startedOrder)<BigInt(a.startedOrder)?p:a,null);
   if(basis.approvedRowsHash!==first.beforeScopeHash||!equipmentRowsEqual(basis.lines,first.beforeLines,binding))stop('original_rows_not_at_history_start');
   result.connectionMode='observed_history';result.checkedApplications=continuity.checkedApplications;
  }else{
   // No observations is not permission to skip an approved or uncertain delta.
   // A draft may have been applied before unlock; equality here is only a row
   // connection and never certifies missing history or approval provenance.
   const changes=new Set(),inputs=new Set();
   for(const change of model.changeOrders){
    if(!object(change)||!id(change.id)||changes.has(change.id)||change.organization_id!==binding.organizationId
     ||change.sales_order_id!==binding.orderId||change.proposal_id!==binding.proposalId)stop('invalid_unobserved_change');
    if(['approved','completed'].includes(change.status))stop('approved_application_missing');
    if(!['draft','pending_approval'].includes(change.status))stop('unsupported_unobserved_change_history');
    changes.add(change.id);
   }
   for(const entry of model.equipmentEvidence.inputs){
    if(!object(entry)||!changes.has(entry.changeOrderId)||inputs.has(entry.changeOrderId)||!hash(entry.inputHash))stop('invalid_unobserved_change_inputs');
    inputs.add(entry.changeOrderId);
   }
   if(inputs.size!==changes.size)stop('invalid_unobserved_change_inputs');
   if(basis.approvedRowsHash!==model.equipmentEvidence.scopeHash||!equipmentRowsEqual(basis.lines,model.lines,binding))stop('current_rows_differ_from_approval');
   result.connectionMode='direct';
  }
  result.approvedRowsConnected=true;
  // Never copy verified flags from input JSON or promote this comparison into
  // original membership, authentic approval, net pricing or quote authority.
 }catch(error){result.issues.push({code:error.message||'invalid_approved_rows_input'});}
 return result;
}
