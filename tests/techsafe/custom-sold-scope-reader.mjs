import assert from 'node:assert/strict';
import {createTechsafeCustomSoldScopeReader} from '../../src/lib/techsafe/postgresCustomSoldScopeReader.mjs';
const c='02e394ef-9576-4a2a-b352-6506b23529d0',o='d8b30c4b-70d0-4180-aca0-907db5a5fa27';
let calls=0;
const client={query:async sql=>{calls++;
 if(sql.includes('FROM techsafe_source.integration_connections'))return {rows:[{organization_id:'org',proposal_id:'proposal',actual_proposal_id:'proposal',enabled:true,status:'active',approval_status:'approved',approved_at:'2026-01-01'}]};
 if(sql.includes('FROM public.change_orders co'))return {rows:[{count:0}]};
 return {rows:[{lineId:'dc758ebe-4547-4759-9e9e-07e2dfa17ff3',productId:null,description:'TV',quantity:1,unitPrice:'1999.95',soldLabor:'270'},
 {lineId:'77fb33c9-3446-4427-8b4f-098eb260ee0b',productId:null,description:'Mount',quantity:1,unitPrice:'449.95',soldLabor:'67.50'}]};
}};
const reader=createTechsafeCustomSoldScopeReader(client);
const result=await reader({connectionId:c,orderId:o,minimumEligibleUnitPrice:250});
assert.equal(result.ready,true);assert.equal(result.items.length,2);assert.equal(result.equipmentCents,244990);
assert.equal(result.equipmentLinkedLaborCents,33750);assert.equal(result.eligibleItems.length,2);
assert.equal(result.items[0].itemKind,'custom');
const hold=createTechsafeCustomSoldScopeReader({query:async sql=>sql.includes('FROM techsafe_source.integration_connections')?{rows:[{organization_id:'org',proposal_id:'proposal',actual_proposal_id:'proposal',enabled:true,status:'active',approval_status:'approved',approved_at:'2026-01-01'}]}:{rows:[{count:1}]}});
assert.equal((await hold({connectionId:c,orderId:o})).reason,'approved_change_scope_unreconciled');
assert.equal(calls,3);
console.log('PASS: read-only committed custom sold scope and fail-closed reconciliation');
