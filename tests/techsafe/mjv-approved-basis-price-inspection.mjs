import assert from 'node:assert/strict';
import {inspectMjvApprovedBasisAndPrices as inspect} from '../../src/lib/techsafe/mjvApprovedBasisPriceInspection.mjs';
import {copy,binding,history} from './fixtures/equipment-history.mjs';
const fixture=()=>{const h=history();h.basis={basisVersion:1,sourceKind:'customer_portal_approval',binding:copy(binding),approvalRef:'approval-1',portalVersion:1,approvedAtEpoch:'1793448000.000000',approvedRowsHash:h.pairs[0].beforeScopeHash,lines:copy(h.pairs[0].beforeLines)};
 const priceRows=h.currentModel.lines.map(x=>({context:{version:1,binding:copy(binding)},row:{line:copy(x.line),unitSalePrice:x.unitSalePrice,salePriceFacts:{parentItemId:null,hasChildren:false,displayMode:'itemized'}}}));
 return {...h,priceRows};};
const h=fixture(),before=JSON.stringify(h),good=inspect({basis:h.basis,currentModel:h.currentModel,pairs:h.pairs,binding,priceRows:h.priceRows});
assert.equal(good.ok,true,JSON.stringify(good));assert.equal(good.connectionMode,'observed_history');assert.equal(good.checkedApplications,8);
assert.equal(good.resolvedPrices.length,h.currentModel.lines.length);
for(const flag of ['authorized','snapshotReady','quoteReady','originalScopeVerified','scopeVerified'])assert.equal(good[flag],false);
assert.equal(JSON.stringify(h),before);
const call=x=>inspect({basis:x.basis,currentModel:x.currentModel,pairs:x.pairs,binding,priceRows:x.priceRows});
const noBasis=fixture();noBasis.basis=null;assert.equal(call(noBasis).reason,'approved_rows_not_connected');
const gap=fixture();gap.pairs[2].beforeLines[0].line.quantity='55.00';assert.equal(call(gap).ok,false);
const missing=fixture();missing.priceRows.pop();assert.equal(call(missing).reason,'price_line_coverage_incomplete');
const bundle=fixture();bundle.priceRows[0].row.salePriceFacts.hasChildren=true;assert.equal(call(bundle).reason,'unit_selling_price_unverified');
const stale=fixture();stale.priceRows[0].row.unitSalePrice='999.00';assert.equal(call(stale).reason,'price_line_source_mismatch');
// A price record must belong to the exact current MJV source row, not merely
// share its line ID and nominal unit price.
for(const change of [
 x=>{x.priceRows[0].row.line.product_id='swapped-product'},
 x=>{x.priceRows[0].row.line.item_type='labor'},
 x=>{x.priceRows[0].row.line.quantity='999.00'},
 x=>{x.priceRows[0].row.line.is_customer_supplied=true},
 x=>{x.priceRows[0].row.line.is_hidden=true},
 x=>{x.priceRows[0].row.line.description='different'},
]){const x=fixture();change(x);assert.equal(call(x).reason,'price_line_source_mismatch');}
const equivalent=fixture();equivalent.priceRows[0].row.unitSalePrice=Number(equivalent.priceRows[0].row.unitSalePrice);
assert.equal(call(equivalent).ok,true,'equivalent decimal prices must match');
const duplicate=fixture();duplicate.priceRows.push(copy(duplicate.priceRows[0]));assert.equal(call(duplicate).ok,false);
console.log('PASS: existing MJV approval basis and unit selling prices inspected without scope/export authorization');
