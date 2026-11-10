import assert from 'node:assert/strict';
import {createPrivateSqlCurrentContentReader} from '../../src/lib/techsafe/postgresPrivateSqlCurrentContentReader.mjs';
import {createOwnedPrivateSqlEquipmentInspection} from '../../src/lib/techsafe/postgresOwnedCurrentEquipmentInspection.mjs';
const ids=Array.from({length:5},(_,i)=>'00000000-0000-0000-0000-'+String(i+1).padStart(12,'0'));
const [connectionId,orderId,organizationId,proposalId,lineId]=ids;
const raw={readModelVersion:1,connectionId,organizationId,
 order:{id:orderId,organization_id:organizationId,proposal_id:proposalId},
 lines:[{line:{id:lineId,organization_id:organizationId,proposal_id:proposalId,product_id:ids[0],quantity:'2.00'},
 membership:{verified:false,scope:'unverified'},salesPriceResolved:false}]};
const calls=[];const client={async query(sql,args){calls.push({sql,args});return {rows:[{source:raw}]}}};
const read=createPrivateSqlCurrentContentReader(client);
const args={client,connectionId,orderId,organizationId,proposalId};
const found=await read(args);assert.strictEqual(found,raw);
assert.equal(found.lines[0].membership.verified,false);
assert.equal(found.lines[0].salesPriceResolved,false);
assert.deepEqual(calls[0].args,[connectionId,orderId]);
assert.equal((await read({...args,client:{}})).reason,'private_sql_binding_unverified');
assert.equal((await read({...args,orderId:'wrong'})).reason,'private_sql_binding_unverified');
const mismatch=createPrivateSqlCurrentContentReader({query:async()=>({rows:[{source:{...raw,organizationId:ids[4]}}]})});
assert.equal((await mismatch({...args,client:undefined})).ok,false);
const malformed=createPrivateSqlCurrentContentReader({query:async()=>({rows:[{source:{...raw,readModelVersion:2}}]})});
assert.equal((await malformed({...args,client:undefined})).ok,false);
const unavailable=createPrivateSqlCurrentContentReader({query:async()=>({rows:[]})});
assert.equal((await unavailable({...args,client:undefined})).ok,false);
// End-to-end owned transaction with actual SQL function: version 1 must hold
// and ROLLBACK, never commit or dispatch even if the SQL returns a plausible row.
const statements=[],released=[];let ledgerReads=0;
const txClient={async query(sql){statements.push(sql);
 if(sql==='SHOW transaction_isolation')return {rows:[{transaction_isolation:'serializable'}]};
 if(sql.includes('integration_connections'))return {rows:[{organization_id:organizationId,proposal_id:proposalId,connection_generation:'2',enabled:true,status:'active'}]};
 if(sql.includes('order_revision_ledger')){ledgerReads++;return {rows:[{organization_id:organizationId,proposal_id:proposalId,connection_generation:'2',revision:'3',state:'candidate',source_fingerprint:'a'.repeat(64)}]};}
 if(sql.includes('public.sales_orders'))return {rows:[{id:orderId,organization_id:organizationId,proposal_id:proposalId}]};
 if(sql.includes('public.proposal_line_items'))return {rows:[{id:lineId,organization_id:organizationId,proposal_id:proposalId,product_id:ids[0],quantity:2}]};
 if(sql.includes('techsafe_source.read_order_source'))return {rows:[{source:raw}]};
 return {rows:[]};},release(error){released.push(error)}};
const inspect=createOwnedPrivateSqlEquipmentInspection({connect:async()=>txClient});
await assert.rejects(()=>inspect({connectionId,orderId}),/transaction_source_held/);
assert.ok(statements.some(x=>x.includes('techsafe_source.read_order_source')));
assert.equal(statements.at(-1),'ROLLBACK');assert.ok(!statements.includes('COMMIT'));
assert.ok(released[0] instanceof Error);
console.log('PASS: existing private SQL source read stays diagnostic and cannot authorize current equipment');
