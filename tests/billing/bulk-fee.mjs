import assert from 'node:assert/strict';
import { allocateRecordedFee as allocate } from '../../src/lib/bulkPaymentFeeAllocation.ts';
assert.deepEqual(allocate([10000,20000],900),[300,600]);
assert.deepEqual(allocate([100,100,100],1),[1,0,0]);
assert.deepEqual(allocate([100,200],0),[0,0]);
assert.deepEqual(allocate([100,200],5),[2,3]);
assert.throws(()=>allocate([0,100],5));
assert.throws(()=>allocate([100],-1));
assert.throws(()=>allocate([],1));
console.log('Bulk payment fee allocation checks passed');

import { recordedBulkPaymentBreakdown as breakdown } from '../../supabase/functions/_shared/recorded-payment-breakdown.ts';
assert.deepEqual(breakdown([{amount:103,convenience_fee_amount:3},{amount:206,convenience_fee_amount:6}]),{grossAmount:309,recordedFee:9,appliedAmount:300});
assert.deepEqual(breakdown([{amount:'0.10'},{amount:'0.20',convenience_fee_amount:0}]),{grossAmount:0.3,recordedFee:0,appliedAmount:0.3});
assert.deepEqual(breakdown([{amount:1.01,convenience_fee_amount:0.01},{amount:1}]),{grossAmount:2.01,recordedFee:0.01,appliedAmount:2});
for(const rows of [[],[{amount:0}],[{amount:1,convenience_fee_amount:1}],[{amount:1,convenience_fee_amount:2}],[{amount:1.001}],[{amount:Infinity}],[{amount:1,convenience_fee_amount:-1}]]) assert.throws(()=>breakdown(rows));
console.log('Persisted bulk receipt totals checks passed');
