import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {prepareTechsafeDraftCandidate as prepare} from '../../supabase/functions/_shared/techsafe-draft-candidate.mjs';
import {copy,digest,binding,history} from './fixtures/equipment-history.mjs';
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
const early=fixture();early.currentModel.order.status='active';Object.defineProperty(early,'pairs',{get(){throw Error('Early history must not be read');}});block(early,'substantial_completion_required');
const drift=fixture();drift.currentModel.lines[0].line.quantity='100.00';block(drift,'approved_application_history_not_connected');
const unknownPrice=fixture();delete unknownPrice.currentModel.lines[0].salePriceFacts;block(unknownPrice,'sales_price_unresolved');
const percentages=fixture();for(const key of ['pricingFacts','discount_percent','misc_parts_percent'])Object.defineProperty(percentages.currentModel,key,{get(){throw Error('Aggregate pricing must not be read');}});pass(percentages);
const costs=fixture();for(const row of costs.currentModel.lines){Object.defineProperty(row,'cost',{get(){throw Error('Cost must not be read');}});Object.defineProperty(row.product,'retail_price',{get(){throw Error('Retail must not be read');}});}pass(costs);
assert.equal(prepare(null,binding).valid,false);
if(process.argv[2]){
 const {prepareImport}=await import(pathToFileURL(process.argv[2]).href);
 const receiverBinding={...binding,sourceInstanceId:'mjv',environment:'sandbox',generation:1,dealerId:'dealer',status:'active',reconciliationRequired:false};
 const envelope={...r.content,connectionId:binding.connectionId,sourceInstanceId:'mjv',environment:'sandbox',generation:1,eventId:'event-1',revision:1,complete:true,scopeState:'committed'};
 const accepted=await prepareImport(envelope,receiverBinding,null);assert.equal(accepted.decision.action,'replace_draft');assert.equal(accepted.snapshot.lines.length,2);assert.equal(accepted.snapshot.customerName,'Example Customer');
 const active={connectionId:binding.connectionId,dealerId:'dealer',orderId:'order',revision:1,contentHash:accepted.contentHash,lifecycle:'active'};
 assert.equal((await prepareImport({...envelope,revision:2},receiverBinding,active)).decision.action,'preserve_coverage_snapshot');
 console.log('Composed candidate accepted by actual Techsafe v2 preparation as one equipment list; active coverage remains preserved. Authorized envelope fields are synthetic test data only.');
}
console.log('Draft candidate passed: one final equipment list from original approval plus eight applied changes, proven removals/additions, stored unit prices, readiness/minimum/opt-out/misc rules, no financial/cost reads and no partial or empty quote candidates.');
