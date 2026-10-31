import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {assessEquipmentContinuity as assess} from '../../supabase/functions/_shared/techsafe-equipment-continuity.mjs';
import {assessEquipmentEffects,equipmentRowsEqual} from '../../supabase/functions/_shared/techsafe-equipment-effects.mjs';
const copy=v=>structuredClone(v),digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const binding={connectionId:'connection',organizationId:'org',orderId:'order',proposalId:'proposal'};
const row=(id,product)=>({line:{id,organization_id:'org',proposal_id:'proposal',product_id:product,item_type:'material',description:product,
 quantity:'1.00',is_customer_supplied:false,is_hidden:false},unitSalePrice:'500.00'});
function history(){
 const pairs=[],observations=[],changeOrders=[],inputs=[];let lines=[row('line','TV'),row('old-line','Speaker')];
 const actions=[['modify_quantity','2.00'],['modify_price','650.00'],['add',null],['remove',null],['modify_quantity','3.00'],['modify_price','700.00'],['modify_labor',null],['modify_modifiers',null]];
 for(let n=0;n<actions.length;n++){
  const [type,value]=actions[n],co={id:'co-'+n,organization_id:'org',sales_order_id:'order',proposal_id:'proposal',status:'approved'};
  const a={id:'action-'+n,organization_id:'org',change_order_id:co.id,action_type:type,proposal_line_item_id:type==='remove'?'old-line':'line',
   sort_order:0,created_at:'1793460000.'+String(n).padStart(6,'0'),remove_scope:null};
  const before=copy(lines);
  if(type==='modify_quantity'){a.new_quantity=value;lines[0].line.quantity=value;}
  if(type==='modify_price'){a.new_unit_price=value;lines[0].unitSalePrice=value;}
  if(type==='remove')lines[1].line.is_hidden=true;
  if(type==='add'){
   Object.assign(a,{proposal_line_item_id:null,product_id:'Projector',product_name:'Projector',product_description:null,item_type:'material',new_quantity:'1.00',new_unit_price:'900.00'});
   const added=row('new-line','Projector');added.unitSalePrice='900.00';lines.push(added);
  }
  const inputHash=digest([co,a]),afterHash=digest(lines),observationId='receipt-'+n;
  const pair={pairVersion:1,observationId,binding:{...binding,changeOrderId:co.id},transactionId:String(100+n),startedOrder:String(n*10+1),completedOrder:String(n*10+4),
   equipmentInputHash:inputHash,beforeScopeHash:digest(before),afterScopeHash:afterHash,changeOrder:copy(co),changeLines:[a],beforeLines:before,afterLines:copy(lines)};
  pairs.push(pair);changeOrders.push(co);inputs.push({changeOrderId:co.id,inputHash});
  observations.push(receipt(pair));
 }
 return {pairs,currentModel:{readModelVersion:1,connectionId:binding.connectionId,organizationId:binding.organizationId,
  order:{id:binding.orderId,organization_id:binding.organizationId,proposal_id:binding.proposalId},lines:copy(lines),changeOrders,observations,
  equipmentEvidence:{version:2,scopeHash:digest(lines),inputs}}};
}
function receipt(p){return {id:p.observationId,connectionId:binding.connectionId,changeOrderId:p.binding.changeOrderId,transactionId:p.transactionId,completed:true,
 equipmentStartedOrder:p.startedOrder,equipmentCompletedOrder:p.completedOrder,equipmentInputHash:p.equipmentInputHash,equipmentAfterScopeHash:p.afterScopeHash};}
function pass(h){const r=assess(h,binding);assert.equal(r.historyContinuous,true,JSON.stringify(r));assert.equal(r.checkedApplications,8);for(const key of ['originalScopeVerified','scopeVerified','snapshotReady','quoteReady'])assert.equal(r[key],false);return r;}
function block(h,code){const r=assess(h,binding);assert.equal(r.historyContinuous,false);assert.equal(r.checkedApplications,0);assert.ok(r.issues.some(x=>x.code===code),JSON.stringify(r));return r;}
const unchanged=history(),beforeAssessment=JSON.stringify(unchanged);pass(unchanged);assert.equal(JSON.stringify(unchanged),beforeAssessment,'Assessment must not modify source facts');
const unordered=history();unordered.pairs.reverse();unordered.currentModel.observations.reverse();unordered.pairs[2].beforeLines.reverse();pass(unordered);
const formatted=history();formatted.currentModel.lines[0].line.quantity=3;formatted.currentModel.lines[0].unitSalePrice=700;formatted.currentModel.lines.reverse();pass(formatted);
const cost=history();for(const p of cost.pairs)for(const r of [...p.beforeLines,...p.afterLines]){r.cost=999;r.retail_price=1;r.line.labor_total=9999;}pass(cost);
const pending=history();pending.currentModel.changeOrders.push({id:'pending',organization_id:'org',sales_order_id:'order',proposal_id:'proposal',status:'draft'});pending.currentModel.equipmentEvidence.inputs.push({changeOrderId:'pending',inputHash:digest('pending')});pass(pending);
const missing=history();missing.pairs.pop();block(missing,'application_pairs_incomplete');
const gap=history(),p=gap.pairs[3];p.beforeLines[0].line.quantity='55.00';p.afterLines[0].line.quantity='55.00';p.beforeScopeHash=digest(p.beforeLines);p.afterScopeHash=digest(p.afterLines);gap.currentModel.observations[3]=receipt(p);block(gap,'equipment_history_gap');
// Equal claimed hashes cannot hide different normalized equipment projections.
const disguised=history();disguised.pairs[3].beforeLines[0].line.quantity='55.00';disguised.pairs[3].afterLines[0].line.quantity='55.00';block(disguised,'equipment_history_gap');
const overlap=history();overlap.pairs[0].completedOrder='13';overlap.currentModel.observations[0]=receipt(overlap.pairs[0]);block(overlap,'overlapping_applications');
const oldRetry=history(),retry=copy(oldRetry.pairs[0]);retry.observationId='old-retry';retry.transactionId='200';retry.startedOrder='81';retry.completedOrder='84';retry.beforeLines=copy(oldRetry.currentModel.lines);
retry.afterLines=copy(retry.beforeLines);retry.afterLines[0].line.quantity='2.00';retry.beforeScopeHash=digest(retry.beforeLines);retry.afterScopeHash=digest(retry.afterLines);
oldRetry.pairs.push(retry);oldRetry.currentModel.observations.push(receipt(retry));oldRetry.currentModel.lines=copy(retry.afterLines);oldRetry.currentModel.equipmentEvidence.scopeHash=retry.afterScopeHash;
assert.equal(assessEquipmentEffects(retry).equipmentEffectsMatch,true);block(oldRetry,'repeated_application_requires_review');
for(const state of ['rejected','draft','pending_approval']){const changed=history();changed.currentModel.changeOrders[0].status=state;changed.currentModel.equipmentEvidence.inputs[0].inputHash=digest(state);block(changed,'applied_change_no_longer_approved');}
const noEffect=history();noEffect.pairs[0].afterLines[0].line.quantity='1.00';block(noEffect,'application_effects_unverified');
const current=history();current.currentModel.lines[0].line.quantity='99.00';block(current,'current_equipment_not_observed');
const metadata=history();metadata.pairs[0].transactionId='999';block(metadata,'pair_receipt_mismatch');
const zeroTransaction=history();zeroTransaction.pairs[0].transactionId='0';zeroTransaction.currentModel.observations[0].transactionId='0';block(zeroTransaction,'pair_receipt_mismatch');
const tenant=history();tenant.pairs[0].binding.organizationId='other';block(tenant,'pair_binding_mismatch');
const proposal=history();proposal.currentModel.changeOrders[0].proposal_id='other';block(proposal,'change_proposal_mismatch');
const inputChange=history();inputChange.currentModel.equipmentEvidence.inputs[0].inputHash=digest('edited');block(inputChange,'application_evidence_not_current');
const newApproved=history();newApproved.currentModel.changeOrders.push({id:'new-approved',organization_id:'org',sales_order_id:'order',proposal_id:'proposal',status:'approved'});newApproved.currentModel.equipmentEvidence.inputs.push({changeOrderId:'new-approved',inputHash:digest('new-approved')});block(newApproved,'application_evidence_not_current');
const duplicate=history();duplicate.pairs[1]=copy(duplicate.pairs[0]);block(duplicate,'invalid_pair_identity');
const foreign=history();foreign.pairs[0].observationId='unexpected';block(foreign,'pair_binding_mismatch');
const legacy=history();legacy.currentModel.observations.unshift({id:'legacy',changeOrderId:'co-0',connectionId:binding.connectionId,completed:true});legacy.pairs.push({...copy(legacy.pairs[0]),observationId:'legacy'});block(legacy,'unverified_application_in_history');
const incomplete=history();incomplete.currentModel.observations.push({id:'incomplete',changeOrderId:'co-0',connectionId:binding.connectionId,completed:false,equipmentStartedOrder:'2',equipmentCompletedOrder:null,equipmentInputHash:incomplete.pairs[0].equipmentInputHash,equipmentAfterScopeHash:null});incomplete.pairs.push({...copy(incomplete.pairs[0]),observationId:'incomplete'});block(incomplete,'unverified_application_in_history');
const large=history();for(let n=0;n<large.pairs.length;n++){large.pairs[n].startedOrder=String(9007199254740993n+BigInt(n*10));large.pairs[n].completedOrder=String(9007199254740996n+BigInt(n*10));large.currentModel.observations[n]=receipt(large.pairs[n]);}pass(large);
const budget=history();for(const pair of budget.pairs){pair.beforeLines=Array(10000).fill(pair.beforeLines[0]);pair.afterLines=Array(10000).fill(pair.afterLines[0]);}block(budget,'equipment_history_budget_exceeded');
const none=history();none.currentModel.changeOrders=[];none.currentModel.equipmentEvidence.inputs=[];none.currentModel.observations=[];none.pairs=[];block(none,'application_evidence_not_current');
block(null,'invalid_continuity_input');
// Shared projection comparison validates identities and reuses exact money rules.
assert.equal(equipmentRowsEqual([row('a','TV'),row('b','TV')],[row('b','TV'),row('a','TV')],binding),true);
assert.throws(()=>equipmentRowsEqual([row('a','TV'),row('a','TV')],[],binding),/invalid_effect_line_identity/);
assert.throws(()=>equipmentRowsEqual([{...row('a','TV'),line:{...row('a','TV').line,organization_id:'other'}}],[],binding),/effect_line_binding_mismatch/);
console.log('Equipment continuity passed: eight approved changes, exact per-application effects, ordered/gap-free observed history, final current rows, pending drafts, overwritten-old retries, reversals, legacy/incomplete/missing evidence, bounds and bigint ordering. No original-scope or quote authorization.');
