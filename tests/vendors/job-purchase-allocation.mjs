import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const module={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/jobPurchaseOrderAllocation.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module,exports:module.exports});
const {allocateCommittedPOCosts}=module.exports;
const po={id:'po1',productId:'speaker',quantity:12,unitPrice:90,documentType:'po',status:'submitted'};
const lines=[{id:'a',productId:'speaker',quantity:4}];
const links=[
 {poItemId:'po1',salesOrderId:'job1',salesOrderLineId:'a',productId:'speaker',quantity:4},
 {poItemId:'po1',salesOrderId:'job2',salesOrderLineId:'b',productId:'speaker',quantity:3},
 {poItemId:'po1',salesOrderId:'job3',salesOrderLineId:'c',productId:'speaker',quantity:5}
];
let r=allocateCommittedPOCosts('job1',lines,[po],links);
assert.equal(r.allocations[0].orderedQuantity,4);
assert.equal(r.allocations[0].orderedUnitCost,90);
assert.equal(r.needsReview.length,0);
r=allocateCommittedPOCosts('job1',lines,[po],[...links,{...links[0],quantity:1}]);
assert.equal(r.allocations[0].orderedQuantity,0);
assert.ok(r.needsReview.some(x=>x.includes('over-allocated-po')));
r=allocateCommittedPOCosts('job1',lines,[po],[links[0]]);
assert.ok(r.needsReview.some(x=>x.includes('unallocated-quantity')));
r=allocateCommittedPOCosts('job1',lines,[{...po,status:'draft'}],links);
assert.equal(r.allocations[0].orderedQuantity,0);
const sql=fs.readFileSync('supabase/migrations/20261123110000_po_line_allocations.sql','utf8');
assert.match(sql,/CREATE TABLE IF NOT EXISTS public\.po_line_allocations/);
assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
assert.match(sql,/PO line quantity over-allocated/);
assert.match(sql,/Sales order line quantity over-allocated/);
console.log('Consolidated multi-job PO allocation tests passed');
