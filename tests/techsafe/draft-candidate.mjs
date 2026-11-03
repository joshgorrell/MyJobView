import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {prepareTechsafeDraftCandidate as prepare} from '../../supabase/functions/_shared/techsafe-draft-candidate.mjs';
import {copy,digest,binding,history} from './fixtures/equipment-history.mjs';
import {prepareTechsafeCandidateFromBundle} from '../../supabase/functions/_shared/techsafe-bundle-composition.mjs';
import {compareTechsafeSourceReread} from '../../supabase/functions/_shared/techsafe-source-reread.mjs';
import {assessOriginalHistoryAnchor} from '../../supabase/functions/_shared/techsafe-original-history-anchor.mjs';
function fixture(direct=false){
 const input=history(),m=input.currentModel;
 input.basis={basisVersion:1,sourceKind:'customer_portal_approval',binding:copy(binding),approvalRef:'approval',portalVersion:1,
  approvedAtEpoch:'1793448000.000000',approvedRowsHash:input.pairs[0].beforeScopeHash,lines:copy(input.pairs[0].beforeLines)};
 if(direct){m.lines=copy(input.basis.lines);m.equipmentEvidence.scopeHash=input.basis.approvedRowsHash;m.changeOrders=[];m.observations=[];m.equipmentEvidence.inputs=[];input.pairs=[];}
 Object.assign(m,{currency:'USD',minimumUnitValueCents:50000,customer:{id:'customer',organization_id:'org',full_name:'Example Customer'},
  completion:{asOfDate:'2026-10-31',project:null},sellingPriceContext:{version:1,binding:copy(binding)}});
 Object.assign(m.order,{contact_id:'customer',project_id:null,status:'complete'});
 for(const row of m.lines){
  row.product={id:row.line.product_id,organization_id:'org',item_type:'material',name:row.line.product_id,sku:row.line.product_id};row.exclusion=null;
  row.salePriceFacts={parentItemId:null,displayMode:'itemized',hasChildren:false};row.salesPriceResolved=false;
  row.membership={verified:false,scope:'unverified'};
 }
 return input;
}
const pass=(i)=>{const r=prepare(i,binding);assert.equal(r.valid,true,JSON.stringify(r));assert.equal(r.equipmentMembershipResolved,true);for(const f of ['scopeVerified','snapshotReady','quoteReady'])assert.equal(r[f],false);return r;};
const block=(i,code)=>{const r=prepare(i,binding);assert.equal(r.valid,false);assert.equal(r.content,null);assert.ok(r.issues.some(x=>x.code===code),JSON.stringify(r));assert.equal(r.quoteReady,false);return r;};
const source=fixture(),before=JSON.stringify(source),r=pass(source);assert.equal(JSON.stringify(source),before);
assert.deepEqual(r.content.lines.map(l=>[l.sourceLineId,l.quantity,l.unitEquipmentValueCents]),[['line',3,70000],['new-line',1,90000]]);
assert.ok(r.excluded.some(x=>x.sourceLineId==='old-line'&&x.reason==='removed'));
assert.equal(r.content.customerName,'Example Customer');assert.equal(r.content.orderId,'order');
for(const key of ['changeOrders','observations','sellingPriceContext','completion','approvalRef','cost','discount_percent'])assert.equal(JSON.stringify(r.content).includes('"'+key+'"'),false);
assert.equal(pass(fixture(true)).content.lines.length,2);
const threshold=fixture();threshold.currentModel.minimumUnitValueCents=80000;assert.deepEqual(pass(threshold).content.lines.map(x=>x.sourceLineId),['new-line']);
const none=fixture();none.currentModel.minimumUnitValueCents=100000;block(none,'no_eligible_equipment');
const opted=fixture();opted.currentModel.lines[0].exclusion={product_id:'TV',organization_id:'org',excluded:true,miscellaneous_placeholder:false};assert.deepEqual(pass(opted).content.lines.map(x=>x.sourceLineId),['new-line']);
const misc=fixture();misc.currentModel.lines.find(x=>x.line.id==='new-line').product.sku='MISC-ITEM';assert.deepEqual(pass(misc).content.lines.map(x=>x.sourceLineId),['line']);
const ignoredPrice=fixture();const mr=ignoredPrice.currentModel.lines.find(x=>x.line.id==='new-line');mr.product.sku='MISC-ITEM';delete mr.salePriceFacts;pass(ignoredPrice);
const originalHidden=fixture(true);originalHidden.basis.lines[0].line.is_hidden=true;originalHidden.currentModel.lines[0].line.is_hidden=true;
originalHidden.basis.approvedRowsHash=originalHidden.currentModel.equipmentEvidence.scopeHash=digest(originalHidden.basis.lines);
block(originalHidden,'scope_unverified');
originalHidden.currentModel.lines[0].membership={verified:true,scope:'included'};block(originalHidden,'scope_unverified');
originalHidden.currentModel.lines[0].exclusion={product_id:'TV',organization_id:'org',excluded:true,miscellaneous_placeholder:false};pass(originalHidden);
const supplied=fixture(true);supplied.basis.lines[0].line.is_customer_supplied=true;supplied.currentModel.lines[0].line.is_customer_supplied=true;
supplied.basis.approvedRowsHash=supplied.currentModel.equipmentEvidence.scopeHash=digest(supplied.basis.lines);assert.equal(pass(supplied).content.lines.length,1);
const noBasis=fixture();noBasis.basis=null;block(noBasis,'original_approval_basis_unavailable');

// Fail-closed source-verification regressions: never promote incomplete evidence into a draft.
const missingPair=fixture();missingPair.pairs.splice(3,1);block(missingPair,'approved_application_history_not_connected');
const changedOriginal=fixture(true);changedOriginal.basis.lines[0].line.quantity='99.00';block(changedOriginal,'current_rows_differ_from_approval');
const wrongCustomer=fixture(true);wrongCustomer.currentModel.customer.id='different-customer';block(wrongCustomer,'customer_binding_mismatch');

for(const status of ['pending_deposit','pending_po','planning','active']){const early=fixture();early.currentModel.order.status=status;Object.defineProperty(early.currentModel,'completion',{get(){throw Error('Completion must not be read');}});const result=pass(early);assert.equal(result.content.orderStatus,'open');assert.deepEqual(result.content.lines,r.content.lines);}
const unknown=fixture();unknown.currentModel.order.status='unknown';Object.defineProperty(unknown,'pairs',{get(){throw Error('Unsupported order history must not be read');}});block(unknown,'draft_order_unverified');
const earlyUnapproved=fixture();earlyUnapproved.currentModel.order.status='active';earlyUnapproved.basis=null;block(earlyUnapproved,'original_approval_basis_unavailable');
const pending=fixture(true);pending.currentModel.order.status='planning';const change={id:'pending-co',organization_id:'org',sales_order_id:'order',proposal_id:'proposal',status:'pending_approval'};pending.currentModel.changeOrders=[change];pending.currentModel.equipmentEvidence.inputs=[{changeOrderId:change.id,inputHash:'a'.repeat(64)}];assert.deepEqual(pass(pending).content.lines,pass(fixture(true)).content.lines,'Pending changes cannot add equipment to the approved list');
pending.currentModel.changeOrders[0].status='approved';block(pending,'approved_application_missing');
const drift=fixture();drift.currentModel.lines[0].line.quantity='100.00';block(drift,'approved_application_history_not_connected');
const unknownPrice=fixture();delete unknownPrice.currentModel.lines[0].salePriceFacts;block(unknownPrice,'sales_price_unresolved');
const percentages=fixture();for(const key of ['pricingFacts','discount_percent','misc_parts_percent'])Object.defineProperty(percentages.currentModel,key,{get(){throw Error('Aggregate pricing must not be read');}});pass(percentages);
const costs=fixture();for(const row of costs.currentModel.lines){Object.defineProperty(row,'cost',{get(){throw Error('Cost must not be read');}});Object.defineProperty(row.product,'retail_price',{get(){throw Error('Retail must not be read');}});}pass(costs);
assert.equal(prepare(null,binding).valid,false);

const anchorSource=fixture();
const anchorOk=assessOriginalHistoryAnchor(anchorSource,binding);
assert.equal(anchorOk.anchored,true,JSON.stringify(anchorOk));
assert.equal(anchorOk.checkedApplications,8);
for(const flag of ['scopeVerified','snapshotReady','quoteReady'])assert.equal(anchorOk[flag],false);
const anchorChanged=fixture();
anchorChanged.basis.lines[0].line.quantity='99.00';
assert.equal(assessOriginalHistoryAnchor(anchorChanged,binding).anchored,false);
const anchorMissing=fixture();
anchorMissing.pairs.splice(2,1);
assert.equal(assessOriginalHistoryAnchor(anchorMissing,binding).anchored,false);
const anchorHash=fixture();
anchorHash.basis.approvedRowsHash='b'.repeat(64);
assert.equal(assessOriginalHistoryAnchor(anchorHash,binding).anchored,false);
assert.equal(assessOriginalHistoryAnchor(null,binding).anchored,false);

const bundleInput=fixture();
const bundle={bundleVersion:1,currentModel:bundleInput.currentModel,basis:bundleInput.basis,
 pairs:bundleInput.pairs,inputFingerprint:'a'.repeat(64),readAtEpoch:'1793448000.000000'};
const composed=prepareTechsafeCandidateFromBundle(bundle,binding);
assert.equal(composed.valid,true,JSON.stringify(composed));
for(const flag of ['scopeVerified','snapshotReady','quoteReady'])assert.equal(composed[flag],false);
const rejectBundle=(b,actor=binding)=>{const out=prepareTechsafeCandidateFromBundle(b,actor);
 assert.equal(out.valid,false,JSON.stringify(out));assert.equal(out.content,null);
 for(const flag of ['scopeVerified','snapshotReady','quoteReady'])assert.equal(out[flag],false);};
rejectBundle(null);
rejectBundle({...bundle,bundleVersion:2});
rejectBundle({...bundle,inputFingerprint:'untrusted'});
rejectBundle({...bundle,readAtEpoch:'invalid'});
rejectBundle({...bundle,pairs:null});
rejectBundle({...bundle,pairs:Array(1001).fill(null)});
// The SQL read_draft_candidate_inputs function explicitly emits false flags.
// Those are safe diagnostic values, not authority, and must be composable.
const sqlShapedBundle={...bundle,scopeVerified:false,snapshotReady:false,quoteReady:false};
const sqlComposed=prepareTechsafeCandidateFromBundle(sqlShapedBundle,binding);
assert.equal(sqlComposed.valid,true,JSON.stringify(sqlComposed));
for(const flag of ['scopeVerified','snapshotReady','quoteReady'])assert.equal(sqlComposed[flag],false);
assert.equal(compareTechsafeSourceReread(sqlShapedBundle,copy(sqlShapedBundle),binding).matches,true);
for(const flag of ['scopeVerified','snapshotReady','quoteReady']){
 rejectBundle({...sqlShapedBundle,[flag]:true});
 rejectBundle({...sqlShapedBundle,[flag]:null});
}
rejectBundle({...bundle,quoteReady:true});
rejectBundle({...bundle,eventId:'fabricated'});
rejectBundle({...bundle,revision:1});
rejectBundle({...bundle,basis:null});

const sameReread=compareTechsafeSourceReread(bundle,copy(bundle),binding);
assert.equal(sameReread.matches,true,JSON.stringify(sameReread));
assert.equal(sameReread.content,null);
for(const flag of ['scopeVerified','snapshotReady','quoteReady'])assert.equal(sameReread[flag],false);
for(const latest of [
 null,
 {...bundle,inputFingerprint:'b'.repeat(64)},
 {...bundle,currentModel:{...bundle.currentModel,organizationId:'other'}},
 {...bundle,quoteReady:true},
 {...bundle,currentModel:{...bundle.currentModel,lines:null}},
]){
 const result=compareTechsafeSourceReread(bundle,latest,binding);
 assert.equal(result.matches,false,JSON.stringify(result));
 assert.equal(result.content,null);
 for(const flag of ['scopeVerified','snapshotReady','quoteReady'])assert.equal(result[flag],false);
}
assert.equal(compareTechsafeSourceReread(null,bundle,binding).matches,false);


for(const key of ['connectionId','organizationId','orderId','proposalId']){
 rejectBundle({...bundle,basis:{...bundle.basis,binding:{...bundle.basis.binding,[key]:'other'}}});
 rejectBundle({...bundle}, {...binding,[key]:'other'});
}
rejectBundle({...bundle,currentModel:{...bundle.currentModel,connectionId:'other'}});
rejectBundle({...bundle,currentModel:{...bundle.currentModel,organizationId:'other'}});
rejectBundle({...bundle,currentModel:{...bundle.currentModel,order:{...bundle.currentModel.order,id:'other'}}});
rejectBundle({...bundle,currentModel:{...bundle.currentModel,order:{...bundle.currentModel.order,proposal_id:'other'}}});
rejectBundle({...bundle,currentModel:{...bundle.currentModel,order:{...bundle.currentModel.order,organization_id:'other'}}});



// Phase 2: malformed and partial source bundles must never authorize export.
// Assert the security outcome rather than coupling these tests to diagnostic codes.
const held=(input,actor=binding)=>{
 const result=prepare(input,actor);
 assert.equal(result.valid,false,JSON.stringify(result));
 assert.equal(result.content,null);
 for(const flag of ['scopeVerified','snapshotReady','quoteReady'])assert.equal(result[flag],false);
};
for(const mutate of [
 input=>{delete input.basis;},
 input=>{delete input.pairs;},
 input=>{input.pairs=null;},
 input=>{input.pairs=[...input.pairs,{...input.pairs[0],startedOrder:'not-an-order'}];},
 input=>{input.currentModel.lines=null;},
 input=>{input.currentModel.order.status='cancelled';},
 input=>{input.currentModel.order.status='deleted';},
 input=>{input.currentModel.customer=null;},
 input=>{input.currentModel.sellingPriceContext=null;},
 input=>{input.basis.lines=null;},
]){
 const input=fixture();mutate(input);held(input);
}
// A valid candidate is still never a source-authorized export envelope.
const candidate=pass(fixture());
assert.equal(candidate.scopeVerified,false);
assert.equal(candidate.snapshotReady,false);
assert.equal(candidate.quoteReady,false);
assert.equal(Object.hasOwn(candidate,'revision'),false);
assert.equal(Object.hasOwn(candidate,'eventId'),false);

if(process.argv[2]){
 const {prepareImport}=await import(pathToFileURL(process.argv[2]).href);
 const receiverBinding={...binding,sourceInstanceId:'mjv',environment:'sandbox',generation:1,dealerId:'dealer',status:'active',reconciliationRequired:false};
 const early=fixture();early.currentModel.order.status='active';const open=pass(early).content;
 const envelope={...open,connectionId:binding.connectionId,sourceInstanceId:'mjv',environment:'sandbox',generation:1,eventId:'event-1',revision:1,complete:true,scopeState:'committed'};
 const accepted=await prepareImport(envelope,receiverBinding,null);assert.equal(accepted.decision.action,'replace_draft');assert.equal(accepted.snapshot.orderStatus,'open');assert.equal(accepted.snapshot.lines.length,2);assert.equal(accepted.snapshot.customerName,'Example Customer');
 const active={connectionId:binding.connectionId,dealerId:'dealer',orderId:'order',revision:1,contentHash:accepted.contentHash,lifecycle:'active'};
 assert.equal((await prepareImport({...envelope,revision:2},receiverBinding,active)).decision.action,'preserve_coverage_snapshot');
 console.log('Composed candidate accepted by actual Techsafe v2 preparation as one equipment list; active coverage remains preserved. Authorized envelope fields are synthetic test data only.');
}
console.log('Draft candidate passed: one final equipment list from original approval plus eight applied changes, proven removals/additions, stored unit prices, precompletion/minimum/opt-out/misc rules, no financial/cost reads and no partial or empty quote candidates.');

