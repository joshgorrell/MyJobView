import assert from 'node:assert/strict';
import {createLockedRevisionReader} from '../../src/lib/techsafe/postgresLockedRevisionReader.mjs';
const ids=['00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004'];
function fixture({active=true,state='candidate',revision='4',fingerprint='a'.repeat(64),proposal=ids[3],connectionRows=1,ledgerRows=1,generation='2'}={}){
 const calls=[];
 const client={async query(sql,params){
  calls.push({sql,params});
  if(sql.includes('integration_connections'))return {rows:Array.from({length:connectionRows},()=>({organization_id:ids[2],proposal_id:ids[3],connection_generation:generation,enabled:active,status:'active'}))};
  return {rows:Array.from({length:ledgerRows},()=>({organization_id:ids[2],proposal_id:proposal,connection_generation:generation,revision,state,source_fingerprint:fingerprint}))};
 }};
 return {calls,read:createLockedRevisionReader(client)};
}
const f=fixture();
const result=await f.read({connectionId:ids[0],orderId:ids[1]});
assert.equal(result.revision,4);
assert.equal(result.connectionGeneration,2);
assert.equal(result.organizationId,ids[2]);
assert.equal(result.proposalId,ids[3]);
assert.equal(Object.isFrozen(result),true);
assert.equal(f.calls.length,2);
assert.ok(f.calls.every(x=>x.sql.includes('FOR UPDATE')));
assert.deepEqual(f.calls[0].params,[ids[0],ids[1]]);
for(const bad of [{active:false},{state:'held'},{revision:'0'},{fingerprint:'0'.repeat(64)},{proposal:ids[1]},{connectionRows:2},{ledgerRows:2},{generation:9007199254740992},{revision:9007199254740992},{generation:'9007199254740993'},{revision:'9007199254740993'}]){
 const x=fixture(bad);
 await assert.rejects(()=>x.read({connectionId:ids[0],orderId:ids[1]}));
 assert.ok(!x.calls.some(c=>c.sql.includes('INSERT')));
}
const invalid=fixture();
await assert.rejects(()=>invalid.read({connectionId:'bad',orderId:ids[1]}));
assert.equal(invalid.calls.length,0);
console.log('PASS: real locked revision reader validates connection, scope, candidate and fingerprints');
