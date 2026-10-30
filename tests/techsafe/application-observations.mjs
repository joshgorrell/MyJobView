import assert from 'node:assert/strict';
import {applicationObservationDb} from './fixtures/application-observation-db.mjs';
const {db,id,org,other,user,outsider,order,proposal,source,apply}=await applicationObservationDb();
try{
const count=async table=>Number((await db.query('SELECT count(*) AS n FROM '+table)).rows[0].n);
await source(200);const complete=await apply(200);assert.ok(complete);
const row=(await db.query('SELECT * FROM techsafe_source.application_observations WHERE id=$1',[complete])).rows[0];
assert.equal(row.change_order_id,id(200));assert.equal(row.actor_id,user);assert.ok(row.completed_at);assert.notEqual(row.before_scope_hash,row.after_scope_hash);assert.equal(await count('proposal_line_items'),1);
await source(201);assert.equal(await apply(201,'begin'),null);assert.equal(await count('proposal_line_items'),2);assert.equal(await count('techsafe_source.application_observations'),1);
await source(202);assert.equal(await apply(202,'finish'),null);assert.equal(await count('proposal_line_items'),3);assert.equal((await db.query('SELECT completed_at FROM techsafe_source.application_observations WHERE change_order_id=$1',[id(202)])).rows[0].completed_at,null);
await source(203);const before=await count('techsafe_source.application_observations');await assert.rejects(apply(203,'',true),e=>e.code==='23514');assert.equal(await count('proposal_line_items'),3);assert.equal(await count('techsafe_source.application_observations'),before);assert.equal((await db.query('SELECT is_active FROM change_orders WHERE id=$1',[id(203)])).rows[0].is_active,true);
await db.exec("UPDATE techsafe_source.integration_connections SET enabled=false");await source(204);assert.equal(await apply(204),null);assert.equal(await count('proposal_line_items'),4);assert.equal(await count('techsafe_source.application_observations'),before);await db.exec('UPDATE techsafe_source.integration_connections SET enabled=true');
// An observation cannot be completed in a later transaction.
await db.query("SELECT set_config('test.actor',$1,false)",[user]);await source(205);
const stale=(await db.query('SELECT techsafe_source.try_begin_application_observation($1) AS id',[id(205)])).rows[0].id;
assert.ok(stale);assert.equal((await db.query('SELECT techsafe_source.try_finish_application_observation($1,$2) AS id',[id(205),stale])).rows[0].id,null);
// Changed source payload or binding in the same transaction cannot complete.
await db.exec('BEGIN');const changed=(await db.query('SELECT techsafe_source.try_begin_application_observation($1) AS id',[id(205)])).rows[0].id;await db.query("UPDATE change_order_line_items SET product_name='Changed' WHERE change_order_id=$1",[id(205)]);assert.equal((await db.query('SELECT techsafe_source.try_finish_application_observation($1,$2) AS id',[id(205),changed])).rows[0].id,null);await db.exec('ROLLBACK');
await db.exec('BEGIN');const rebound=(await db.query('SELECT techsafe_source.try_begin_application_observation($1) AS id',[id(205)])).rows[0].id;await db.query('UPDATE techsafe_source.integration_connections SET connection_id=$1',[id(41)]);assert.equal((await db.query('SELECT techsafe_source.try_finish_application_observation($1,$2) AS id',[id(205),rebound])).rows[0].id,null);await db.exec('ROLLBACK');
// Contradictory tenant relationships refuse evidence without touching source.
await db.exec('BEGIN');await db.query('UPDATE proposal_line_items SET organization_id=$1 WHERE proposal_id=$2',[other,proposal]);assert.equal((await db.query('SELECT techsafe_source.application_read_set($1) AS data',[id(205)])).rows[0].data,null);await db.exec('ROLLBACK');
await db.exec('BEGIN');await db.query("UPDATE change_order_line_items SET product_name=repeat('x',4194305) WHERE change_order_id=$1",[id(205)]);assert.equal((await db.query('SELECT techsafe_source.application_read_set($1) AS data',[id(205)])).rows[0].data,null);await db.exec('ROLLBACK');
// A read set over the supported size is refused, not silently truncated.
await db.exec('BEGIN');await db.query("INSERT INTO change_orders(id,sales_order_id,organization_id,status) SELECT gen_random_uuid(),$1,$2,'draft' FROM generate_series(1,1001)",[order,org]);assert.equal((await db.query('SELECT techsafe_source.application_read_set($1) AS data',[id(205)])).rows[0].data,null);await db.exec('ROLLBACK');
await db.query("SELECT set_config('test.actor',$1,false)",[outsider]);assert.equal((await db.query('SELECT techsafe_source.application_read_set($1) AS data',[id(205)])).rows[0].data,null);
for(const role of ['anon','authenticated']){
 for(const signature of ['application_read_set(uuid)','try_begin_application_observation(uuid)','try_finish_application_observation(uuid,uuid)'])assert.equal((await db.query('SELECT has_function_privilege($1,$2,\'EXECUTE\') AS allowed',[role,'techsafe_source.'+signature])).rows[0].allowed,false);
 assert.equal((await db.query("SELECT has_table_privilege($1,'techsafe_source.application_observations','SELECT,INSERT,UPDATE,DELETE') AS allowed",[role])).rows[0].allowed,false);
}
assert.equal((await db.query("SELECT relrowsecurity FROM pg_class WHERE oid='techsafe_source.application_observations'::regclass")).rows[0].relrowsecurity,true);
console.log('Dormant observation tests passed: no workflow attachments, successful before/after capture, observer failure isolation, original error propagation/rollback, disabled connections, transaction/payload/binding mismatch, size bound and private permissions.');
}finally{await db.close();}
