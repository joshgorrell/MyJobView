import assert from 'node:assert/strict';
import {inspectCurrentSoldComponents as inspect} from '../../src/lib/techsafe/inspectCurrentSoldComponents.mjs';
const history={ok:true,historyCompletenessCertified:false,needsHistoricalReconciliation:false};
const material={id:'material',productId:'product',quantity:2,itemType:'material',
 unitSalePriceCents:25000,lineSaleTotalCents:50000,laborSaleTotalCents:0,
 hidden:false,customerSupplied:false};
const labor={id:'labor',productId:null,quantity:1,itemType:'labor',
 unitSalePriceCents:0,lineSaleTotalCents:12000,laborSaleTotalCents:12000,
 hidden:false,customerSupplied:false};
const valid=inspect({baseLines:[material,labor],history});
assert.equal(valid.ok,true);assert.equal(valid.authorized,false);
assert.equal(valid.snapshotReady,false);
assert.equal(valid.materialSoldCents,50000);
assert.equal(valid.laborSoldCents,12000);
assert.equal(valid.equipmentLines,1);assert.equal(valid.laborLines,1);
assert.equal(valid.unresolvedLines,0);
assert.ok(valid.blockers.includes('original_approved_line_membership_unverified'));
const liveStyle=inspect({baseLines:[{...material,quantity:1,
 unitSalePriceCents:24995,lineSaleTotalCents:19995,laborSaleTotalCents:22500}],history});
assert.equal(liveStyle.ok,true);
assert.equal(liveStyle.unresolvedLines,1);
assert.equal(liveStyle.laborSoldCents,22500);
assert.equal(liveStyle.laborLines,1);
assert.equal(liveStyle.materialSoldCents,0);
assert.ok(liveStyle.issues.some(x=>x.reason==='discount_or_credit_requires_allocation'));
const embeddedLabor=inspect({baseLines:[{...material,quantity:1,
 unitSalePriceCents:29995,lineSaleTotalCents:63745,laborSaleTotalCents:33750}],history});
assert.equal(embeddedLabor.unresolvedLines,1);
assert.equal(embeddedLabor.laborSoldCents,33750);
assert.ok(embeddedLabor.issues.some(x=>x.reason==='extended_total_includes_labor'));
const belowThreshold=inspect({baseLines:[{...material,unitSalePriceCents:10000,lineSaleTotalCents:20000}],history});
assert.equal(belowThreshold.ok,true);
assert.equal(belowThreshold.materialSoldCents,20000); // inspection does not apply dealer threshold
for(const line of [
 {...material,lineSaleTotalCents:60000},
 {...material,unitSalePriceCents:null},
 {...material,itemType:'both'},
 {...material,hidden:null},
 {...material,customerSupplied:true},
 {...material,laborSaleTotalCents:null}
]){
 const v=inspect({baseLines:[line],history});
 assert.equal(v.ok,true);assert.equal(v.unresolvedLines,1);
 assert.equal(v.authorized,false);assert.equal(v.snapshotReady,false);
}
const risky=inspect({baseLines:[material],history:{...history,needsHistoricalReconciliation:true}});
assert.ok(risky.blockers.includes('change_history_reconciliation_required'));
assert.equal(inspect({baseLines:[material],history:{...history,ok:false}}).ok,false);
assert.equal(inspect({baseLines:[material],history:{...history,historyCompletenessCertified:true}}).ok,false);
assert.equal(inspect({baseLines:[{...material,quantity:-1}],history}).ok,false);
console.log('PASS: current sold parts/labor inspection preserves unresolved splits, pricing and history blockers');
