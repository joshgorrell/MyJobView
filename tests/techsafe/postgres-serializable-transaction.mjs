import assert from 'node:assert/strict';
import {createSerializableSourceTransaction} from '../../src/lib/techsafe/postgresSerializableTransaction.mjs';
const inert={ok:true,authorized:false,snapshotReady:false};
function fixture({isolation='serializable',failOn=null,reader=true}={}) {
 const queries=[],released=[];
 const client={async query(sql){
  queries.push(sql);
  if(sql===failOn)throw Object.assign(Error('database failure'),{code:'40001'});
  if(sql==='SHOW transaction_isolation')return {rows:[{transaction_isolation:isolation}]};
  return {rows:[]};
 },release(err){released.push(err)}};
 const pool={async connect(){return client}};
 const makeReader=()=>reader?{
  readConsistentSource:async()=>({}),
  readCompleteEquipmentDetails:async()=>[],
  readCurrentRevision:async()=>({})
 }:null;
 return {queries,released,withTx:createSerializableSourceTransaction(pool,makeReader)};
}
const good=fixture();
assert.strictEqual(await good.withTx(async tx=>{
 assert.equal(tx.isolationLevel,'serializable');
 assert.equal(tx.serverOwned,true);
 assert.equal(typeof tx.readConsistentSource,'function');
 assert.equal(Object.isFrozen(tx),true);
 return inert;
}),inert);
assert.deepEqual(good.queries,['BEGIN ISOLATION LEVEL SERIALIZABLE READ WRITE','SHOW transaction_isolation','COMMIT']);
assert.equal(good.released.length,1);
assert.equal(good.released[0],undefined);
for(const bad of [
 {options:{isolation:'read committed'},callback:async()=>inert},
 {options:{reader:false},callback:async()=>inert},
 {options:{failOn:'SHOW transaction_isolation'},callback:async()=>inert},
 {options:{failOn:'COMMIT'},callback:async()=>inert},
 {options:{},callback:async()=>{throw Error('source changed')}},
 {options:{},callback:async()=>({ok:true,authorized:true,snapshotReady:true})},
 {options:{},callback:async()=>null}
]) {
 const f=fixture(bad.options);
 await assert.rejects(()=>f.withTx(bad.callback));
 assert.equal(f.queries[0],'BEGIN ISOLATION LEVEL SERIALIZABLE READ WRITE');
 assert.equal(f.queries.at(-1),'ROLLBACK');
 assert.equal(f.released.length,1);
 assert.ok(f.released[0] instanceof Error);
}
const beginFail=fixture({failOn:'BEGIN ISOLATION LEVEL SERIALIZABLE READ WRITE'});
await assert.rejects(()=>beginFail.withTx(async()=>inert));
assert.deepEqual(beginFail.queries,['BEGIN ISOLATION LEVEL SERIALIZABLE READ WRITE']);
assert.equal(beginFail.released.length,1);
console.log('PASS: server-owned PostgreSQL SERIALIZABLE transaction commit/rollback/isolation and connection disposal');
