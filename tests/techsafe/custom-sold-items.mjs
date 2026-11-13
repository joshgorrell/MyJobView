import assert from 'node:assert/strict';
import {normalizeSoldEquipmentItems} from '../../src/lib/techsafe/normalizeSoldEquipmentItems.mjs';
const id1='dc758ebe-4547-4759-9e9e-07e2dfa17ff3';
const id2='77fb33c9-3446-4427-8b4f-098eb260ee0b';
const items=normalizeSoldEquipmentItems([
 {lineId:id1,productId:null,description:'85 inch QLED TV',quantity:1,unitPrice:'1999.95',soldLabor:'270.00',minimumEligibleUnitPrice:250},
 {lineId:id2,productId:null,description:'Strong tilt mount',quantity:1,unitPrice:'449.95',soldLabor:'67.50',minimumEligibleUnitPrice:250},
 {lineId:'11111111-1111-4111-8111-111111111111',description:'Removed speaker',quantity:1,unitPrice:299.95,soldLabor:0,removed:true}
]);
assert.equal(items.length,2);
assert.equal(items[0].itemKind,'custom');
assert.equal(items[0].catalogProductId,null);
assert.equal(items.reduce((sum,x)=>sum+x.equipmentTotalCents,0),244990);
assert.equal(items.reduce((sum,x)=>sum+x.soldLaborCents,0),33750);
assert.equal(items.every(x=>x.eligibleByUnitMinimum),true);
assert.throws(()=>normalizeSoldEquipmentItems([{lineId:id1,description:'',quantity:1,unitPrice:1,soldLabor:0}]),/description/);
assert.throws(()=>normalizeSoldEquipmentItems([{lineId:id1,description:'TV',quantity:1,unitPrice:-1,soldLabor:0}]),/amount/);
assert.throws(()=>normalizeSoldEquipmentItems([{lineId:id1,description:'TV',quantity:1,unitPrice:1,soldLabor:0},{lineId:id1,description:'TV',quantity:1,unitPrice:1,soldLabor:0}]),/duplicate/);
console.log('PASS: custom sold items preserve equipment and labor independently');
