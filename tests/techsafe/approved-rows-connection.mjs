import assert from 'node:assert/strict';
import {assessApprovedRowsConnection as assess} from '../../supabase/functions/_shared/techsafe-approved-rows-connection.mjs';
import {copy,digest,binding,history} from './fixtures/equipment-history.mjs';
function connected(){
 const h=history();h.basis={basisVersion:1,sourceKind:'customer_portal_approval',binding:copy(binding),approvalRef:'approval-1',portalVersion:1,
  approvedAtEpoch:'1793448000.000000',approvedRowsHash:h.pairs[0].beforeScopeHash,lines:copy(h.pairs[0].beforeLines)};return h;
}
function direct(){
 const h=connected();h.currentModel.lines=copy(h.basis.lines);h.currentModel.equipmentEvidence.scopeHash=h.basis.approvedRowsHash;
 h.currentModel.changeOrders=[];h.currentModel.observations=[];h.currentModel.equipmentEvidence.inputs=[];h.pairs=[];return h;
}
const pass=(h,mode='observed_history')=>{const r=assess(h,binding);assert.equal(r.approvedRowsConnected,true,JSON.stringify(r));assert.equal(r.connectionMode,mode);
 assert.equal(r.checkedApplications,mode==='direct'?0:8);for(const flag of ['originalScopeVerified','scopeVerified','snapshotReady','quoteReady'])assert.equal(r[flag],false);return r;};
const block=(h,code)=>{const r=assess(h,binding);assert.equal(r.approvedRowsConnected,false);assert.equal(r.connectionMode,null);assert.equal(r.checkedApplications,0);assert.ok(r.issues.some(x=>x.code===code),JSON.stringify(r));return r;};
const stable=connected(),before=JSON.stringify(stable);pass(stable);assert.equal(JSON.stringify(stable),before);
pass(direct(),'direct');
const unsorted=connected();unsorted.pairs.reverse();unsorted.currentModel.observations.reverse();unsorted.basis.lines.reverse();pass(unsorted);
const numeric=direct();numeric.currentModel.lines[0].line.quantity=1;numeric.currentModel.lines[0].unitSalePrice=500;pass(numeric,'direct');
const cost=connected();for(const row of cost.basis.lines){row.cost=99999;row.retail_price=1;row.line.labor_total=900;}pass(cost);
const pending=direct();pending.currentModel.changeOrders.push({id:'pending',organization_id:'org',sales_order_id:'order',proposal_id:'proposal',status:'draft'});
pending.currentModel.equipmentEvidence.inputs.push({changeOrderId:'pending',inputHash:digest('pending')});pass(pending,'direct');
const approved=copy(pending);approved.currentModel.changeOrders[0].status='approved';block(approved,'approved_application_missing');
for(const status of ['completed','rejected','unknown']){const h=copy(pending);h.currentModel.changeOrders[0].status=status;block(h,status==='completed'?'approved_application_missing':'unsupported_unobserved_change_history');}
const noInput=copy(pending);noInput.currentModel.equipmentEvidence.inputs=[];block(noInput,'invalid_unobserved_change_inputs');
const duplicate=copy(pending);duplicate.currentModel.changeOrders.push(copy(duplicate.currentModel.changeOrders[0]));block(duplicate,'invalid_unobserved_change');
const wrongProposal=copy(pending);wrongProposal.currentModel.changeOrders[0].proposal_id='other';block(wrongProposal,'invalid_unobserved_change');
const gap=connected();gap.basis.approvedRowsHash=digest('different');block(gap,'original_rows_not_at_history_start');
const disguised=connected();disguised.basis.lines[0].line.quantity='5.00';block(disguised,'original_rows_not_at_history_start');
const late=connected();late.basis.lines=copy(late.currentModel.lines);late.basis.approvedRowsHash=late.currentModel.equipmentEvidence.scopeHash;block(late,'original_rows_not_at_history_start');
const changed=direct();changed.currentModel.lines[0].unitSalePrice='999.00';block(changed,'current_rows_differ_from_approval');
const changedHash=direct();changedHash.currentModel.equipmentEvidence.scopeHash=digest('different');block(changedHash,'current_rows_differ_from_approval');
const missingHistory=connected();missingHistory.pairs.pop();block(missingHistory,'approved_application_history_not_connected');
const missingBasis=connected();missingBasis.basis=null;block(missingBasis,'original_approval_basis_unavailable');
const manual=direct();manual.basis.sourceKind='staff_approval';block(manual,'original_basis_binding_mismatch');
for(const key of ['connectionId','organizationId','orderId','proposalId']){const h=connected();h.basis.binding[key]='other';block(h,'original_basis_binding_mismatch');}
const currentBinding=direct();currentBinding.currentModel.order.organization_id='other';block(currentBinding,'current_order_binding_mismatch');
for(const [key,value] of [['approvalRef',''],['portalVersion',-1],['portalVersion',2147483648],['approvedAtEpoch','yesterday'],['approvedRowsHash','bad']]){
 const h=direct();h.basis[key]=value;block(h,'invalid_original_basis');
}
const hidden=direct();hidden.basis.lines[0].line.is_hidden=true;hidden.currentModel.lines[0].line.is_hidden=true;
hidden.basis.approvedRowsHash=hidden.currentModel.equipmentEvidence.scopeHash=digest(hidden.basis.lines);pass(hidden,'direct');
// Connected rows do not infer membership from the hidden flag or input booleans.
hidden.basis.originalScopeVerified=true;hidden.basis.quoteReady=true;hidden.currentModel.quoteReady=true;pass(hidden,'direct');
const foreign=direct();foreign.basis.lines[0].line.organization_id='other';block(foreign,'effect_line_binding_mismatch');
const conflictingIds=direct();conflictingIds.basis.lines.push(copy(conflictingIds.basis.lines[0]));block(conflictingIds,'invalid_effect_line_identity');
const legacy=direct();legacy.currentModel.observations=[{id:'legacy'}];block(legacy,'approved_application_history_not_connected');
const budget=connected();for(const p of budget.pairs){p.beforeLines=Array(10000).fill(p.beforeLines[0]);p.afterLines=Array(10000).fill(p.afterLines[0]);}block(budget,'approved_rows_budget_exceeded');
const unbounded=direct();unbounded.basis.lines=Array(10001).fill(unbounded.basis.lines[0]);block(unbounded,'invalid_original_basis');
block(null,'invalid_approved_rows_input');assert.equal(assess(direct(),null).approvedRowsConnected,false);
console.log('Approved rows connection passed: original-to-first observation, eight-change history-to-current, no-change orders, untouched drafts, missing/ambiguous/reversed histories, row/hash drift, bindings, limits and immutable inputs. No sold-membership, pricing or quote authorization.');
