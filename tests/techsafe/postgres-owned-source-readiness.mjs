import assert from 'node:assert/strict';
import {createOwnedTechsafeSourceReadiness} from '../../src/lib/techsafe/postgresOwnedSourceReadiness.mjs';
const ids=['00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004'];
let queries=[],released=[];
const client={
 async query(sql){
  queries.push(sql);
  if(sql.startsWith('BEGIN'))return {rows:[]};
  if(sql==='SHOW transaction_isolation')return {rows:[{transaction_isolation:'serializable'}]};
  if(sql.includes('pg_catalog.pg_class'))return {rows:[]};
  if(sql==='ROLLBACK')return {rows:[]};
  if(sql==='COMMIT')throw Error('should_not_commit');
  throw Error('unexpected_query');
 },
 release(error){released.push(error)}
};
const run=createOwnedTechsafeSourceReadiness({connect:async()=>client});
const invalid=await run({connectionId:'invalid'});
assert.equal(invalid.reason,'invalid_binding');
assert.equal(queries.length,0);
const held=await run({connectionId:ids[0],orderId:ids[1],organizationId:ids[2],proposalId:ids[3]});
assert.equal(held.authorized,false);
assert.equal(held.snapshotReady,false);
assert.equal(held.reason,'source_readiness_unavailable');
assert.ok(queries.some(x=>x.includes('pg_catalog.pg_class')),'Must inspect real PostgreSQL catalog');
assert.ok(queries.includes('ROLLBACK'),'Held source must roll back');
assert.ok(!queries.includes('COMMIT'),'Never commit incomplete source inspection');
assert.equal(released.length,1);
assert.ok(released[0] instanceof Error,'Discard failed transaction');
console.log('PASS: owned Techsafe source readiness checks actual SQL and cannot certify or commit incomplete source');
