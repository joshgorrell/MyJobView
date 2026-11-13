import assert from 'node:assert/strict';
import {normalizeSoldEquipmentItems} from '../../src/lib/techsafe/normalizeSoldEquipmentItems.mjs';
const tv='dc758ebe-4547-4759-9e9e-07e2dfa17ff3',mount='77fb33c9-3446-4427-8b4f-098eb260ee0b';
const misc='715017c5-c899-4cc0-8b83-b2c2a634c380';
const rows=normalizeSoldEquipmentItems([
 {lineId:tv,productId:'11111111-1111-4111-8111-111111111111',description:'TV',quantity:1,unitPrice:1999.95,soldLabor:270,minimumEligibleUnitPrice:250},
 {lineId:mount,productId:misc,isMisc:true,description:'One-time special mount',quantity:1,unitPrice:449.95,soldLabor:67.5,minimumEligibleUnitPrice:250},
 {lineId:'33333333-3333-4333-8333-333333333333',productId:misc,description:'Removed',quantity:1,unitPrice:500,soldLabor:0,removed:true}
]);
assert.equal(rows.length,2);assert.equal(rows[1].itemKind,'misc');assert.equal(rows[1].catalogProductId,misc);
assert.equal(rows.reduce((n,r)=>n+r.equipmentTotalCents,0),244990);
assert.equal(rows.reduce((n,r)=>n+r.soldLaborCents,0),33750);
assert.ok(rows.every(r=>r.eligibleByUnitMinimum));
assert.throws(()=>normalizeSoldEquipmentItems([{lineId:tv,productId:null,description:'Legacy',quantity:1,unitPrice:500,soldLabor:0}]),/catalog_product_id_required/);
assert.throws(()=>normalizeSoldEquipmentItems([{lineId:tv,productId:misc,description:'',quantity:1,unitPrice:1,soldLabor:0}]),/sold_description_required/);
assert.throws(()=>normalizeSoldEquipmentItems([{lineId:tv,productId:misc,description:'Misc',quantity:1,unitPrice:-1,soldLabor:0}]),/invalid_sold_amount/);
assert.throws(()=>normalizeSoldEquipmentItems([{lineId:tv,productId:misc,description:'A',quantity:1,unitPrice:1,soldLabor:0},{lineId:tv,productId:misc,description:'B',quantity:1,unitPrice:1,soldLabor:0}]),/duplicate_sold_line_id/);
console.log('PASS: catalog-only, reusable Misc overrides, missing IDs held');
