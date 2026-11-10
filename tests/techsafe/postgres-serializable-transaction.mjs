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
 return {client,queries,released,withTx:createSerializableSourceTransaction(pool,makeReader)};
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
// A reader can perform incidental writes before returning a held result.
// Such a transaction must roll back rather than commit those writes.
const heldSource=fixture();
await assert.rejects(()=>heldSource.withTx(async()=>({
 ok:false,authorized:false,snapshotReady:false,reason:'source_changed'
})),/transaction_source_held/);
assert.equal(heldSource.queries.at(-1),'ROLLBACK');
assert.ok(!heldSource.queries.includes('COMMIT'));
assert.ok(heldSource.released[0] instanceof Error);
const beginFail=fixture({failOn:'BEGIN ISOLATION LEVEL SERIALIZABLE READ WRITE'});
await assert.rejects(()=>beginFail.withTx(async()=>inert));
assert.deepEqual(beginFail.queries,['BEGIN ISOLATION LEVEL SERIALIZABLE READ WRITE']);
assert.equal(beginFail.released.length,1);
// Writer receives the exact transaction client and is never called outside it.
const writerFixture=fixture();
let receivedEvidence, receivedClient;
const writer=async ({client,evidence})=>{
 receivedClient=client;receivedEvidence=evidence;
 return {ok:true,authorized:false,snapshotReady:false};
};
const wrapped=createSerializableSourceTransaction(
 {connect:async()=>writerFixture.client},
 ()=>({readConsistentSource:async()=>({}),readCompleteEquipmentDetails:async()=>[],readCurrentRevision:async()=>({})}),
 writer);
await wrapped(async tx=>{
 assert.equal(typeof tx.persistCertificate,'function');
 await tx.persistCertificate({test:'same-transaction'});
 return inert;
});
assert.deepEqual(receivedEvidence,{test:'same-transaction'});
assert.strictEqual(receivedClient,writerFixture.client);
assert.equal(writerFixture.queries.at(-1),'COMMIT');
const failureFixture=fixture();
const failWrapped=createSerializableSourceTransaction(
 {connect:async()=>failureFixture.client},
 ()=>({readConsistentSource:async()=>({}),readCompleteEquipmentDetails:async()=>[],readCurrentRevision:async()=>({})}),
 async()=>{throw Error('certificate insert failed')});
await assert.rejects(()=>failWrapped(async tx=>{
 await tx.persistCertificate({test:'rollback'});
 return inert;
}));
assert.equal(failureFixture.queries.at(-1),'ROLLBACK');

// The current-equipment path is a first-class contract, not three fake
// legacy methods. Neither interface is implicitly available to the other.
const currentOnly=fixture();
const currentOnlyExecutor=createSerializableSourceTransaction(
 {connect:async()=>currentOnly.client},
 ()=>({inspectCurrentEquipment:async ({orderId})=>({
   ok:true,authorized:false,snapshotReady:false,orderId
 })}));
const currentResult=await currentOnlyExecutor(async tx=>{
 assert.equal(typeof tx.inspectCurrentEquipment,'function');
 assert.equal('readConsistentSource' in tx,false);
 assert.equal('readCompleteEquipmentDetails' in tx,false);
 assert.equal('readCurrentRevision' in tx,false);
 return tx.inspectCurrentEquipment({orderId:'test-order'});
});
assert.equal(currentResult.orderId,'test-order');
assert.equal(currentOnly.queries.at(-1),'COMMIT');
const missingCurrent=fixture();
const missingCurrentExecutor=createSerializableSourceTransaction(
 {connect:async()=>missingCurrent.client},()=>({inspectCurrentEquipment:null}));
await assert.rejects(()=>missingCurrentExecutor(async()=>inert),/trusted_source_reader_missing/);
assert.equal(missingCurrent.queries.at(-1),'ROLLBACK');
const legacyOnly=fixture();
await legacyOnly.withTx(async tx=>{
 assert.equal('inspectCurrentEquipment' in tx,false);
 return inert;
});

console.log('PASS: server-owned PostgreSQL SERIALIZABLE transaction commit/rollback/isolation and connection disposal');
