import assert from 'node:assert/strict';
import {createTechsafeCertificationReadinessInspector} from '../../src/lib/techsafe/postgresCertificationReadinessInspector.mjs';
const connectionId='02e394ef-9576-4a2a-b352-6506b23529d0';
const orderId='d8b30c4b-70d0-4180-aca0-907db5a5fa27';
const proposalId='16089a2a-7b67-48c4-a590-2f2d68c2f928';
let queries=0;
const client={query:async(sql,params)=>{
 queries++;assert.deepEqual(params,[connectionId,orderId]);
 if(sql.includes('FROM techsafe_source.integration_connections'))return {rows:[{
  enabled:false,status:'held',connection_generation:1,proposal_id:proposalId,
  actual_proposal_id:proposalId,approval_status:'approved',approval_completed_at:'2026-03-06'}]};
 return {rows:[]};
}};
const inspect=createTechsafeCertificationReadinessInspector(client);
const result=await inspect({connectionId,orderId});
assert.equal(result.authorized,false);assert.equal(result.ready,false);
assert.equal(result.reason,'certification_gate_connectionActive');
assert.equal(result.checks.approvedSalesOrder,true);
assert.equal(result.checks.revisionPresent,false);
assert.equal(result.checks.certificatePresent,false);
assert.equal(result.checks.deliveryAuthorityImplemented,false);
assert.equal(queries,3);
const invalid=await inspect({connectionId:'bad',orderId});
assert.equal(invalid.reason,'invalid_binding');assert.equal(queries,3);
const fail=createTechsafeCertificationReadinessInspector({query:async()=>{throw Error('private database error')}});
assert.deepEqual(await fail({connectionId,orderId}),{ready:false,authorized:false,reason:'private_source_inspection_failed',checks:{}});
console.log('PASS: certification diagnostics show blockers and never grant authority');
