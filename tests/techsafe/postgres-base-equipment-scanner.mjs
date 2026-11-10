import assert from 'node:assert/strict';
import {createPostgresBaseEquipmentScanner} from '../../src/lib/techsafe/postgresBaseEquipmentScanner.mjs';
const ids=['00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000005'];
const scope={orderId:ids[0],organizationId:ids[1],proposalId:ids[2]};
function fixture({missingOrder=false,wrongOrder=false,lines=[{id:ids[3],organization_id:ids[1],proposal_id:ids[2],product_id:ids[4],quantity:2}]}={}){
 const calls=[];
 const client={async query(sql,params){calls.push({sql,params});return {rows:sql.includes('sales_orders')?(missingOrder?[]:[{id:wrongOrder?ids[4]:ids[0],organization_id:ids[1],proposal_id:ids[2]}]):lines}}};
 return {calls,scan:createPostgresBaseEquipmentScanner(client)};
}
const f=fixture(),good=await f.scan(scope);
assert.equal(good.ok,true);assert.equal(good.authorized,false);
assert.equal(good.baseLinesAreCurrent,true);
assert.equal(good.baseLineSource,'current_proposal_line_items');
assert.equal(good.approvalVerified,false);assert.equal(good.sourceManifestComplete,false);
assert.equal(good.baseLineCount,1);assert.equal(good.baseLines[0].quantity,2);
assert.equal(Object.isFrozen(good.baseLines),true);
assert.equal(f.calls.length,2);
assert.match(f.calls[0].sql,/FROM public\.sales_orders/);
assert.match(f.calls[1].sql,/FROM public\.proposal_line_items/);
assert.ok(f.calls.every(c=>c.sql.includes('FOR SHARE')));
assert.deepEqual(f.calls[1].params,[ids[1],ids[2]]);
for(const x of [
 {missingOrder:true},{wrongOrder:true},
 {lines:[{id:ids[3],organization_id:ids[1],proposal_id:ids[2],product_id:null,quantity:2}]},
 {lines:[{id:ids[3],organization_id:ids[1],proposal_id:ids[2],product_id:ids[4],quantity:-1}]},
 {lines:[{id:ids[3],organization_id:ids[1],proposal_id:ids[4],product_id:ids[4],quantity:2}]},
 {lines:Array(10001).fill(null)}
]) {
 const result=await fixture(x).scan(scope);
 assert.equal(result.ok,false);assert.equal(result.authorized,false);
}
const invalid=fixture();
assert.equal((await invalid.scan({...scope,proposalId:'untrusted'})).ok,false);
assert.equal(invalid.calls.length,0);
console.log('PASS: scoped PostgreSQL Sales Order base scanner never attests approval, changes or dispatch');
