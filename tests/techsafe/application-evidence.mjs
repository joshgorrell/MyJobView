import assert from 'node:assert/strict';
import {assessApplicationEvidence} from '../../supabase/functions/_shared/techsafe-application-evidence.mjs';
const a='a'.repeat(64),b='b'.repeat(64),c='c'.repeat(64);
const binding={connectionId:'connection-1',organizationId:'org-1',orderId:'order-1',proposalId:'proposal-1'};
const model=()=>({readModelVersion:1,connectionId:'connection-1',organizationId:'org-1',order:{id:'order-1',organization_id:'org-1',proposal_id:'proposal-1'},
 changeOrders:[{id:'co-1',organization_id:'org-1',sales_order_id:'order-1',status:'approved'}],
 equipmentEvidence:{version:2,scopeHash:b,inputs:[{changeOrderId:'co-1',inputHash:a}]},
 observations:[{id:'observation-1',changeOrderId:'co-1',connectionId:'connection-1',completed:true,equipmentInputHash:a,equipmentAfterScopeHash:b,equipmentStartedOrder:'1',equipmentCompletedOrder:'2'}]});
const check=m=>assessApplicationEvidence(m,binding),has=(m,code)=>check(m).issues.some(x=>x.code===code);
assert.equal(check(model()).applicationEvidenceCurrent,true);assert.equal(check(model()).scopeVerified,false);assert.equal(check(model()).snapshotReady,false);assert.equal(check(model()).quoteReady,false);
assert.equal(check(null).applicationEvidenceCurrent,false);
const wrong=model();wrong.organizationId='other';assert.equal(has(wrong,'source_binding_mismatch'),true);
const legacy=model();delete legacy.equipmentEvidence;assert.equal(has(legacy,'equipment_evidence_unavailable'),true);
const old=model();old.observations=[{id:'old-1',changeOrderId:'co-1',connectionId:'connection-1',completed:true}];assert.equal(has(old,'matching_application_missing'),true);
const changed=model();changed.equipmentEvidence.inputs[0].inputHash=c;assert.equal(has(changed,'matching_application_missing'),true);assert.equal(has(changed,'latest_application_inputs_changed'),true);
const edited=model();edited.equipmentEvidence.scopeHash=c;assert.equal(has(edited,'equipment_changed_since_application'),true);
const pending=model();pending.changeOrders.push({id:'co-2',organization_id:'org-1',sales_order_id:'order-1',status:'draft'});pending.equipmentEvidence.inputs.push({changeOrderId:'co-2',inputHash:c});assert.equal(check(pending).applicationEvidenceCurrent,true);
pending.changeOrders[1].status='approved';assert.equal(has(pending,'matching_application_missing'),true);
const two=model();two.changeOrders.push({id:'co-2',organization_id:'org-1',sales_order_id:'order-1',status:'approved'});two.equipmentEvidence.inputs.push({changeOrderId:'co-2',inputHash:c});two.observations.push({id:'observation-2',changeOrderId:'co-2',connectionId:'connection-1',completed:true,equipmentInputHash:c,equipmentAfterScopeHash:b,equipmentStartedOrder:'3',equipmentCompletedOrder:'4'});assert.equal(check(two).applicationEvidenceCurrent,true);
// Older matching scope cannot hide a later completed state that no longer matches.
two.observations[1].equipmentAfterScopeHash=c;assert.equal(has(two,'equipment_changed_since_application'),true);
const incomplete=model();incomplete.observations.push({id:'incomplete-1',changeOrderId:'co-1',connectionId:'connection-1',completed:false,equipmentInputHash:a,equipmentStartedOrder:'3',equipmentCompletedOrder:null,equipmentAfterScopeHash:null});assert.equal(has(incomplete,'application_incomplete'),true);
const oldIncomplete=model();oldIncomplete.observations[0].equipmentStartedOrder='3';oldIncomplete.observations[0].equipmentCompletedOrder='4';oldIncomplete.observations.push({id:'incomplete-old',changeOrderId:'co-1',connectionId:'connection-1',completed:false,equipmentInputHash:a,equipmentStartedOrder:'1',equipmentCompletedOrder:null,equipmentAfterScopeHash:null});assert.equal(check(oldIncomplete).applicationEvidenceCurrent,true);
const orphan=model();orphan.observations.push({id:'orphan',changeOrderId:'deleted-co',connectionId:'connection-1',completed:true});assert.equal(has(orphan,'orphaned_observation'),true);
const duplicate=model();duplicate.observations.push({...duplicate.observations[0],id:'duplicate'});assert.equal(has(duplicate,'duplicate_evidence_order'),true);
const huge=model();huge.observations[0].equipmentStartedOrder='9007199254740993';huge.observations[0].equipmentCompletedOrder='9007199254740994';assert.equal(check(huge).applicationEvidenceCurrent,true);
const invalid=model();invalid.observations[0].equipmentCompletedOrder='9223372036854775808';assert.equal(has(invalid,'invalid_equipment_observation'),true);
const noChanges=model();noChanges.changeOrders=[];noChanges.equipmentEvidence.inputs=[];noChanges.observations=[];assert.equal(has(noChanges,'original_scope_basis_required'),true);
console.log('Application evidence checks passed: exact approved input versions, latest ordered scope witness, missing/stale/incomplete/legacy/orphan/conflicting evidence, pending changes, safe bigint ordering and no scope/snapshot/quote authorization.');
