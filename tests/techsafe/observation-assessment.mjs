import assert from 'node:assert/strict';
import fs from 'node:fs';
import {applicationObservationDb} from './fixtures/application-observation-db.mjs';
const {db,id,org,other,user,outsider,order,proposal,source,apply,definitions,normalize,originalDefinitions}=await applicationObservationDb();
try{
await db.exec(fs.readFileSync('supabase/migrations/20261030183520_techsafe_application_observation_assessment.sql','utf8'));
const assess=async(co,observation)=>(await db.query('SELECT techsafe_source.assess_application_observation($1,$2) AS result',[id(co),observation])).rows[0].result;
const expect=async(co,observation,state)=>assert.deepEqual(await assess(co,observation),{state,quoteReady:false});
const receipts=[];
for(let co=200;co<208;co++){
 await source(co);receipts.push(await apply(co));await expect(co,receipts.at(-1),'matches_current_read_set');
}
await expect(200,receipts[0],'source_changed');
const co=207,receipt=receipts.at(-1);
await expect(co,id(999999),'missing_observation');await expect(co,null,'missing_observation');
await expect(206,receipt,'binding_mismatch');
// Completed observations are compared with actual current rows, not caller hashes.
const line=(await db.query('SELECT id FROM proposal_line_items WHERE description=$1',['Equipment '+co])).rows[0].id;
for(const sql of [
 'UPDATE proposal_line_items SET quantity=9 WHERE id=$1',
 'UPDATE proposal_line_items SET unit_price=900 WHERE id=$1',
 "UPDATE proposal_line_items SET description='New model' WHERE id=$1",
 "UPDATE proposal_line_items SET product_id='10000000-0000-0000-0000-000000009999' WHERE id=$1",
 'UPDATE proposal_line_items SET is_hidden=true WHERE id=$1',
 'DELETE FROM proposal_line_items WHERE id=$1',
]){await db.exec('BEGIN');await db.query(sql,[line]);await expect(co,receipt,'scope_changed');await db.exec('ROLLBACK');await expect(co,receipt,'matches_current_read_set');}
await db.exec('BEGIN');await db.query('INSERT INTO proposal_line_items(proposal_id,organization_id,description) VALUES($1,$2,$3)',[proposal,org,'New equipment']);await expect(co,receipt,'scope_changed');await db.exec('ROLLBACK');
await db.exec('BEGIN');await db.query('UPDATE change_order_line_items SET new_quantity=2 WHERE change_order_id=$1',[id(co)]);await expect(co,receipt,'source_changed');await db.exec('ROLLBACK');
await db.exec('BEGIN');await source(208);await expect(co,receipt,'source_changed');await db.exec('ROLLBACK');
await db.exec('BEGIN');await db.query('DELETE FROM change_order_line_items WHERE change_order_id=$1',[id(200)]);await db.query('DELETE FROM change_orders WHERE id=$1',[id(200)]);await expect(co,receipt,'source_changed');await db.exec('ROLLBACK');
// Ordinary bookkeeping does not masquerade as changed equipment content.
await db.exec('BEGIN');await db.query("UPDATE proposal_line_items SET updated_at=now()+interval '1 hour' WHERE id=$1",[line]);await db.query('UPDATE change_orders SET is_active=true,updated_at=now() WHERE id=$1',[id(co)]);await expect(co,receipt,'matches_current_read_set');await db.exec('ROLLBACK');
for(const status of ['paused','revoked','disconnected']){await db.exec('BEGIN');await db.query('UPDATE techsafe_source.integration_connections SET status=$1',[status]);await expect(co,receipt,'source_unavailable');await db.exec('ROLLBACK');}
await db.exec('BEGIN');await db.exec('UPDATE techsafe_source.integration_connections SET enabled=false');await expect(co,receipt,'source_unavailable');await db.exec('ROLLBACK');
await db.exec('BEGIN');await db.query('UPDATE techsafe_source.integration_connections SET connection_id=$1',[id(41)]);await expect(co,receipt,'binding_mismatch');await db.exec('ROLLBACK');
await db.exec('BEGIN');await db.query("UPDATE change_orders SET status='draft' WHERE id=$1",[id(co)]);await expect(co,receipt,'source_unavailable');await db.exec('ROLLBACK');
await db.query("SELECT set_config('test.actor',$1,false)",[outsider]);await expect(co,receipt,'source_unavailable');await db.query("SELECT set_config('test.actor',$1,false)",[user]);
// Even when matching, the diagnostic cannot publish a quote or certify history.
const rowsBefore=(await db.query('SELECT * FROM techsafe_source.application_observations ORDER BY id')).rows;
await expect(co,receipt,'matches_current_read_set');
assert.deepEqual((await db.query('SELECT * FROM techsafe_source.application_observations ORDER BY id')).rows,rowsBefore);
await source(208);await apply(208,'finish');
const incomplete=(await db.query('SELECT id FROM techsafe_source.application_observations WHERE change_order_id=$1',[id(208)])).rows[0].id;
await expect(208,incomplete,'incomplete_observation');
await db.exec('BEGIN');await db.exec("CREATE OR REPLACE FUNCTION techsafe_source.application_read_set(p_co uuid) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$BEGIN RAISE EXCEPTION 'Read unavailable';END$$");await expect(208,incomplete,'read_error');await db.exec('ROLLBACK');
for(const role of ['anon','authenticated'])assert.equal((await db.query("SELECT has_function_privilege($1,'techsafe_source.assess_application_observation(uuid,uuid)','EXECUTE') AS allowed",[role])).rows[0].allowed,false);
const attributes=(await db.query("SELECT provolatile,prosecdef FROM pg_proc WHERE oid='techsafe_source.assess_application_observation(uuid,uuid)'::regprocedure")).rows[0];assert.equal(attributes.provolatile,'s');assert.equal(attributes.prosecdef,false);
assert.deepEqual((await definitions()).map(r=>normalize(r.definition)),originalDefinitions.map(r=>normalize(r.definition)));
assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE '%techsafe%'")).rows[0].n,0);
console.log('Observation assessment passed: eight applications, changed/deleted/added equipment, changed CO history, missing/incomplete evidence, pause/revoke/rebind/unlock, cross-tenant denial, read errors, read-only behavior and quoteReady=false in every state.');
}finally{await db.close();}
