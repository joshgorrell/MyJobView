import assert from 'node:assert/strict';
import fs from 'node:fs';
import {assessEquipmentEffects} from '../../supabase/functions/_shared/techsafe-equipment-effects.mjs';
const migration='supabase/migrations/20261031170609_techsafe_private_equipment_snapshot_pairs.sql';
// Runs in the private-order-source fixture after its existing v1/v2 safeguards.
export async function testEquipmentSnapshotPairs(f){
 const {db,id,org,other,actor,outsider,order,proposal,connection,product,line,co}=f;
 const definition=(await db.query("SELECT pg_get_functiondef('techsafe_source.try_begin_application_observation(uuid)'::regprocedure) AS value")).rows[0].value;
 await db.exec('BEGIN');await db.exec(definition.replace('RETURN identity;','RETURN NULL;'));
 await assert.rejects(db.exec(fs.readFileSync(migration,'utf8')),/Review changed equipment observation helper/);await db.exec('ROLLBACK');
 await db.exec('BEGIN');await db.exec("ALTER FUNCTION techsafe_source.try_begin_application_observation(uuid) SECURITY DEFINER");
 await assert.rejects(db.exec(fs.readFileSync(migration,'utf8')),/Review changed equipment observation helper/);await db.exec('ROLLBACK');
 await db.exec(fs.readFileSync(migration,'utf8'));
 assert.equal((await db.query('SELECT count(equipment_before_facts)::int AS n FROM techsafe_source.application_observations')).rows[0].n,0,'No legacy facts backfill');
 const begin=async()=>(await db.query('SELECT techsafe_source.try_begin_application_observation($1) AS id',[co])).rows[0].id;
 const finish=async(observation)=>(await db.query('SELECT techsafe_source.try_finish_application_observation($1,$2) AS id',[co,observation])).rows[0].id;
 const pair=async(observation,c=connection,o=order)=>(await db.query('SELECT techsafe_source.read_application_equipment_pair($1,$2,$3) AS pair',[c,o,observation])).rows[0].pair;
 const actorAs=async(value)=>db.query("SELECT set_config('test.actor',$1,false)",[value]);
 await actorAs(actor);
 await db.query('UPDATE change_order_line_items SET new_quantity=4 WHERE change_order_id=$1',[co]);
 await db.exec('BEGIN');const observation=await begin();assert.ok(observation);
 assert.equal(await pair(observation),null,'Incomplete facts must not produce a pair');
 await db.query('UPDATE proposal_line_items SET quantity=4 WHERE id=$1',[line]);
 assert.equal(await finish(observation),observation);await db.exec('COMMIT');
 const complete=await pair(observation);assert.ok(complete);assert.equal(complete.pairVersion,1);
 const effect=assessEquipmentEffects(complete);assert.equal(effect.equipmentEffectsMatch,true,JSON.stringify(effect));
 assert.equal(effect.scopeVerified,false);assert.equal(complete.quoteReady,false);assert.equal(complete.snapshotReady,false);
 assert.equal(complete.beforeLines.find(x=>x.line.id===line).line.quantity,'3.00');
 assert.equal(complete.afterLines.find(x=>x.line.id===line).line.quantity,'4.00');
 assert.equal(typeof complete.transactionId,'string');assert.ok(BigInt(complete.completedOrder)>BigInt(complete.startedOrder));
 // A completed pair is evidence of observations, not successful intended effects.
 for(const [sql,code] of [
  ["UPDATE change_order_line_items SET action_type='add',proposal_line_item_id=NULL,new_quantity=4 WHERE change_order_id=$1",'ambiguous_addition_identity'],
  ["UPDATE change_order_line_items SET action_type='modify_quantity',proposal_line_item_id=NULL,new_quantity=9 WHERE change_order_id=$1",'action_target_missing']
 ]){
  await db.exec('BEGIN');await db.query(sql,[co]);const ineffective=await begin();assert.ok(ineffective);assert.equal(await finish(ineffective),ineffective);
  const assessment=assessEquipmentEffects(await pair(ineffective));assert.equal(assessment.equipmentEffectsMatch,false);assert.ok(assessment.issues.some(x=>x.code===code),JSON.stringify(assessment));await db.exec('ROLLBACK');
 }
 assert.deepEqual(Object.keys(complete.beforeLines[0]).sort(),['line','unitSalePrice']);
 assert.equal(JSON.stringify(complete).includes('PRIVATE_'),false);assert.equal(JSON.stringify(complete).includes('José'),false);
 for(const key of ['cost','retail_price','email','phone','internal_notes','labor_total'])assert.equal(JSON.stringify(complete).includes('"'+key+'"'),false);
 const stored=(await db.query('SELECT equipment_before_facts AS before,equipment_after_facts AS after FROM techsafe_source.application_observations WHERE id=$1',[observation])).rows[0];
 await db.query('UPDATE products SET cost=99999,retail_price=99999 WHERE id=$1',[product]);
 await db.query('UPDATE proposal_line_items SET cost=33333 WHERE id=$1',[line]);assert.deepEqual(await pair(observation),complete);
 await db.exec("SET TIME ZONE 'America/Chicago'");assert.deepEqual(await pair(observation),complete);await db.exec("SET TIME ZONE 'UTC'");
 // A historical pair remains readable after later edits. It is not freshness proof.
 await db.exec('BEGIN');await db.query('UPDATE proposal_line_items SET unit_price=999 WHERE id=$1',[line]);assert.deepEqual(await pair(observation),complete);await db.exec('ROLLBACK');
 for(const [column,path,value] of [
  ['equipment_before_facts','{lines,0,unitSalePrice}','"999"'],
  ['equipment_after_facts','{changeLines,0,new_quantity}','"999"'],
  ['equipment_before_facts','{binding,organizationId}',JSON.stringify(other)],
  ['equipment_after_facts','{lines}','{}'],
  ['equipment_before_facts','{lines,0,cost}','"PRIVATE_UNHASHED_COST"'],
  ['equipment_after_facts','{changeOrder,private_notes}','"PRIVATE_UNHASHED_NOTE"'],
  ['equipment_before_facts','{unexpected}','"PRIVATE_UNHASHED_ROOT"']
 ]){
  await db.exec('BEGIN');await db.query('UPDATE techsafe_source.application_observations SET '+column+'=jsonb_set('+column+',$1,$2::jsonb) WHERE id=$3',[path,value,observation]);
  assert.equal(await pair(observation),null,'Corrupt '+column+' '+path+' must not be usable');await db.exec('ROLLBACK');
 }
 // Completion binds the same actor, transaction and approved input version.
 await db.exec('BEGIN');const edited=await begin();assert.ok(edited);
 await db.query('UPDATE change_order_line_items SET new_quantity=5 WHERE change_order_id=$1',[co]);assert.equal(await finish(edited),null);await db.exec('ROLLBACK');
 await db.exec('BEGIN');const crossTransaction=await begin();assert.ok(crossTransaction);await db.exec('COMMIT');
 assert.equal(await finish(crossTransaction),null);assert.equal(await pair(crossTransaction),null);
 await db.exec('BEGIN');const crossActor=await begin();assert.ok(crossActor);await actorAs(outsider);assert.equal(await finish(crossActor),null);await db.exec('ROLLBACK');await actorAs(actor);
 // Bounded facts fail as a whole, while source work survives capture failures.
 const grow=async()=>db.query("INSERT INTO proposal_line_items(organization_id,proposal_id,product_id,item_type,quantity,unit_price,is_customer_supplied,description,is_hidden) SELECT $1,$2,$3,'material',1,800,false,repeat('X',12000),false FROM generate_series(1,100)",[org,proposal,product]);
 await db.exec('BEGIN');await grow();assert.equal(await begin(),null);await db.exec('ROLLBACK');
 await db.exec('BEGIN');const oversizedAfter=await begin();assert.ok(oversizedAfter);await grow();assert.equal(await finish(oversizedAfter),null);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM proposal_line_items')).rows[0].n,102,'Failed capture must not undo source rows');await db.exec('ROLLBACK');
 await assert.rejects(db.query("UPDATE techsafe_source.application_observations SET equipment_before_facts=jsonb_build_object('large',repeat('x',1048576)) WHERE id=$1",[observation]),e=>e.code==='23514');
 for(const update of ["status='paused'","status='revoked'","enabled=false","last_verified_at=now()-interval '6 minutes'"]){
  await db.exec('BEGIN');await db.exec('UPDATE techsafe_source.integration_connections SET '+update);assert.equal(await pair(observation),null);assert.equal(await begin(),null);await db.exec('ROLLBACK');
 }
 assert.equal(await pair(observation,id(999)),null);assert.equal(await pair(observation,connection,id(999)),null);
 await db.exec('BEGIN');await db.query("UPDATE techsafe_source.application_observations SET equipment_before_facts=equipment_before_facts #- '{changeLines,0,product_description}' WHERE id=$1",[observation]);
 assert.equal(await pair(observation),null,'Missing nullable fields must not bypass canonical validation');await db.exec('ROLLBACK');
 await actorAs(outsider);assert.equal(await pair(observation),null);await actorAs(actor);
 for(const role of ['anon','authenticated','service_role']){
  await db.exec('BEGIN; SET LOCAL ROLE '+role);await assert.rejects(pair(observation),e=>e.code==='42501');await db.exec('ROLLBACK');
  assert.equal((await db.query("SELECT has_table_privilege($1,'techsafe_source.application_observations','SELECT') AS allowed",[role])).rows[0].allowed,false);
 }
 assert.equal((await db.query("SELECT relrowsecurity FROM pg_class WHERE oid='techsafe_source.application_observations'::regclass")).rows[0].relrowsecurity,true);
 const signatures=['equipment_application_facts(jsonb,uuid)','equipment_facts_evidence(jsonb)','read_application_equipment_pair(uuid,uuid,uuid)',
  'try_begin_application_observation(uuid)','try_finish_application_observation(uuid,uuid)'];
 for(const signature of signatures){
  const attrs=(await db.query('SELECT prosecdef,proconfig FROM pg_proc WHERE oid=$1::regprocedure',['techsafe_source.'+signature])).rows[0];
  assert.equal(attrs.prosecdef,false);assert.deepEqual(attrs.proconfig,['search_path=""']);
  for(const role of ['anon','authenticated','service_role'])assert.equal((await db.query('SELECT has_function_privilege($1,$2,\'EXECUTE\') AS allowed',[role,'techsafe_source.'+signature])).rows[0].allowed,false);
 }
 assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN ('sales_orders'::regclass,'proposals'::regclass,'change_orders'::regclass,'proposal_line_items'::regclass)")).rows[0].n,0);
 assert.deepEqual((await db.query('SELECT equipment_before_facts AS before,equipment_after_facts AS after FROM techsafe_source.application_observations WHERE id=$1',[observation])).rows[0],stored);
 console.log('Equipment snapshot pairs passed: bounded allowlisted before/after facts, no legacy backfill, drift guards, exact effect assessment, transaction/actor/input binding, hash revalidation, corruption/health/tenant/API denial, and capture failures preserve source rows. Historical pairs do not certify current scope or quotes.');
}
