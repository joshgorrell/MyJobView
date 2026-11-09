import assert from 'node:assert/strict';
import {projectTechsafeEquipment} from '../../src/lib/techsafe/equipmentTransportProjection.mjs';
const inspection={ok:true,authorized:false,snapshotReady:false,revision:7,items:[
 {sourceLineId:'base',productId:'display',quantity:2},
 {sourceLineId:'change:added',productId:'camera',quantity:1}
]};
const details=[
 {sourceLineId:'base',productRef:'display',description:'Display',unitEquipmentValueCents:75000,customerSupplied:false,techsafeExcluded:false,productKind:'equipment'},
 {sourceLineId:'change:added',productRef:'camera',description:'Camera',unitEquipmentValueCents:12000,customerSupplied:false,techsafeExcluded:true,productKind:'equipment'}
];
const project=(overrides={})=>projectTechsafeEquipment({inspection,details,minimumUnitValueCents:25000,...overrides});
const good=project();
assert.equal(good.ok,true);
assert.equal(good.authorized,false);
assert.equal(good.snapshotReady,false);
assert.equal(good.lines.length,1);
assert.equal(good.lines[0].sourceLineId,'base');
assert.equal(good.lines[0].unitEquipmentValueCents,75000);
assert.equal(project({details:[details[0],{...details[1],techsafeExcluded:false,unitEquipmentValueCents:30000}]}).lines[1].sourceLineId,'change:added');
assert.equal(project({details:[details[0],{...details[1],sourceLineId:'change:bad!'}]}).reason,'invalid_equipment_detail');
assert.equal(project({inspection:{...inspection,ok:false}}).ok,false);
assert.equal(project({inspection:{...inspection,authorized:true}}).ok,false);
assert.equal(project({details:details.slice(0,1)}).reason,'equipment_details_incomplete');
assert.equal(project({details:[details[0],details[0]]}).reason,'invalid_equipment_detail');
assert.equal(project({details:[{...details[0],productRef:'wrong'},details[1]]}).reason,'equipment_identity_mismatch');
assert.equal(project({details:[{...details[0],unitEquipmentValueCents:-1},details[1]]}).reason,'invalid_equipment_detail');
assert.equal(project({details:[{...details[0],productKind:'labor'},details[1]]}).reason,'invalid_equipment_detail');
assert.equal(project({inspection:{...inspection,items:[]},details:[]}).ok,true);
assert.equal(project({inspection:{...inspection,items:[{...inspection.items[0],quantity:10001}]},details:[details[0]]}).reason,'invalid_reconciled_equipment');
// Repeating an authoritative source identity must not create duplicate Techsafe lines.
assert.equal(project({inspection:{...inspection,items:[inspection.items[0],inspection.items[0]]},details:[details[0],details[1]]}).reason,'invalid_reconciled_equipment');
// A filtered-out source line must not consume the covered-value budget.
assert.equal(project({details:[details[0],{...details[1],unitEquipmentValueCents:Number.MAX_SAFE_INTEGER}]}).ok,true);
// Multiplication and aggregation overflow are both rejected before returning a draft.
assert.equal(project({details:[{...details[0],unitEquipmentValueCents:Number.MAX_SAFE_INTEGER},details[1]]}).reason,'equipment_value_overflow');
assert.equal(project({details:[{...details[0],unitEquipmentValueCents:4000000000000000}, {...details[1],techsafeExcluded:false,unitEquipmentValueCents:2000000000000000}],minimumUnitValueCents:0}).reason,'equipment_value_overflow');
console.log('PASS: fail-closed MJV approved Sales Order equipment projection and change-order identities');
