import assert from 'node:assert/strict';
import fs from 'node:fs';
import {applicationObservationDb} from './fixtures/application-observation-db.mjs';
const {db,id,org,user,order,proposal,source,definitions,normalize,originalDefinitions}=await applicationObservationDb();
try{
await db.exec(fs.readFileSync('supabase/migrations/20261030183520_techsafe_application_observation_assessment.sql','utf8'));
const beforeAttributes=(await db.query("SELECT proowner,proacl,proconfig,prosecdef,prorettype FROM pg_proc WHERE oid='public.apply_change_order(uuid)'::regprocedure")).rows[0];
await db.exec(fs.readFileSync('supabase/migrations/20261030184035_techsafe_opt_in_application_observer.sql','utf8'));
const strip=s=>s.replace(/v_techsafe_observation uuid; -- TECHSAFE_OBSERVER_VARIABLE/g,'').replace(/-- TECHSAFE_OBSERVER_BEGIN_START[\s\S]*?-- TECHSAFE_OBSERVER_BEGIN_END/g,'').replace(/-- TECHSAFE_OBSERVER_FINISH_START[\s\S]*?-- TECHSAFE_OBSERVER_FINISH_END/g,'');
assert.deepEqual((await definitions()).map(r=>normalize(strip(r.definition))),originalDefinitions.map(r=>normalize(r.definition)));
assert.deepEqual((await db.query("SELECT proowner,proacl,proconfig,prosecdef,prorettype FROM pg_proc WHERE oid='public.apply_change_order(uuid)'::regprocedure")).rows[0],beforeAttributes);
async function apply(co,fault='',core=false){await db.exec('BEGIN');try{await db.query("SELECT set_config('test.actor',$1,true),set_config('test.fail_observer',$2,true),set_config('test.fail_core',$3,true)",[user,fault,String(core)]);await db.exec('SET LOCAL ROLE authenticated');await db.query('SELECT public.apply_change_order($1)',[id(co)]);await db.exec('COMMIT');}catch(e){await db.exec('ROLLBACK');throw e;}}
const count=async(table,co=null)=>Number((await db.query('SELECT count(*) AS n FROM '+table+(co===null?'':' WHERE change_order_id=$1'),co===null?[]:[id(co)])).rows[0].n);
const observations=co=>db.query('SELECT * FROM techsafe_source.application_observations WHERE change_order_id=$1',[id(co)]);
assert.equal(await count('techsafe_source.application_observer_controls'),0);
await source(200);await apply(200);assert.equal(await count('proposal_line_items'),1);assert.equal(await count('techsafe_source.application_observations'),0,'switch defaults off');
await db.query('INSERT INTO techsafe_source.application_observer_controls VALUES($1,true)',[org]);
await source(201);await apply(201);const first=(await observations(201)).rows[0];assert.ok(first.completed_at);assert.notEqual(first.before_scope_hash,first.after_scope_hash);
assert.deepEqual((await db.query('SELECT techsafe_source.assess_application_observation($1,$2) AS result',[id(201),first.id])).rows[0].result,{state:'matches_current_read_set',quoteReady:false});
await source(202);await apply(202,'begin');assert.equal(await count('proposal_line_items'),3);assert.equal(await count('techsafe_source.application_observations',202),0);
await source(203);await apply(203,'finish');assert.equal(await count('proposal_line_items'),4);assert.equal((await observations(203)).rows[0].completed_at,null);
await source(204);const before=await count('techsafe_source.application_observations');await assert.rejects(apply(204,'',true),e=>e.code==='23514');assert.equal(await count('proposal_line_items'),4);assert.equal(await count('techsafe_source.application_observations'),before);assert.equal((await db.query('SELECT is_active FROM change_orders WHERE id=$1',[id(204)])).rows[0].is_active,true);
await db.exec("UPDATE techsafe_source.integration_connections SET status='paused'");await source(205);await apply(205);assert.equal(await count('proposal_line_items'),5);assert.equal(await count('techsafe_source.application_observations',205),0);await db.exec("UPDATE techsafe_source.integration_connections SET status='active'");
await db.exec('UPDATE techsafe_source.application_observer_controls SET enabled=false');await source(206);await apply(206);assert.equal(await count('proposal_line_items'),6);assert.equal(await count('techsafe_source.application_observations',206),0);await db.exec('UPDATE techsafe_source.application_observer_controls SET enabled=true');
// Even loss of the helper/control relation does not add an ordinary save error.
await db.exec('BEGIN');await source(207);await db.exec('DROP FUNCTION techsafe_source.try_begin_application_observation(uuid)');await db.query("SELECT set_config('test.actor',$1,true)",[user]);await db.exec('SET LOCAL ROLE authenticated');await db.query('SELECT public.apply_change_order($1)',[id(207)]);await db.exec('RESET ROLE');assert.equal(await count('proposal_line_items'),7);assert.equal(await count('techsafe_source.application_observations',207),0);await db.exec('ROLLBACK');
await db.exec('BEGIN');await source(208);await db.exec('DROP TABLE techsafe_source.application_observer_controls');await db.query("SELECT set_config('test.actor',$1,true)",[user]);await db.exec('SET LOCAL ROLE authenticated');await db.query('SELECT public.apply_change_order($1)',[id(208)]);await db.exec('RESET ROLE');assert.equal(await count('proposal_line_items'),7);assert.equal(await count('techsafe_source.application_observations',208),0);await db.exec('ROLLBACK');
await db.exec('BEGIN');await source(211);await db.exec('DROP FUNCTION techsafe_source.try_finish_application_observation(uuid,uuid)');await db.query("SELECT set_config('test.actor',$1,true)",[user]);await db.exec('SET LOCAL ROLE authenticated');await db.query('SELECT public.apply_change_order($1)',[id(211)]);await db.exec('RESET ROLE');assert.equal(await count('proposal_line_items'),7);assert.equal((await observations(211)).rows[0].completed_at,null);await db.exec('ROLLBACK');
// The current source addition semantics are preserved, including its ambiguity.
await source(209);await db.query('INSERT INTO change_order_line_items SELECT $1,change_order_id,organization_id,action_type,proposal_line_item_id,product_id,product_description,product_name,new_quantity,new_unit_price,is_taxable,item_type,labor_phase_id,sort_order,created_at,labor_hours,labor_rate,new_labor_total FROM change_order_line_items WHERE change_order_id=$2',[id(9999),id(209)]);await apply(209);assert.equal(await count('proposal_line_items'),7);assert.equal(await count('techsafe_source.application_observations',209),1);
await source(210);await db.query("UPDATE change_orders SET status='draft' WHERE id=$1",[id(210)]);await assert.rejects(apply(210),e=>e.message.includes('must be in approved status'));assert.equal(await count('techsafe_source.application_observations',210),0);
// All existing non-add branches keep their original outcomes.
const target=(await db.query('SELECT id FROM proposal_line_items WHERE description=$1',['Equipment 201'])).rows[0].id;
for(const [co,action,fields] of [[220,'modify_quantity',{new_quantity:3}],[221,'modify_price',{new_unit_price:650}],[222,'modify_labor',{labor_hours:2,labor_rate:80,new_labor_total:160}],[223,'remove',{}],[224,'modify_modifiers',{}]]){
 await source(co);await db.query('UPDATE change_order_line_items SET action_type=$1,proposal_line_item_id=$2 WHERE change_order_id=$3',[action,target,id(co)]);
 for(const [key,value] of Object.entries(fields))await db.query('UPDATE change_order_line_items SET '+key+'=$1 WHERE change_order_id=$2',[value,id(co)]);
 await apply(co);assert.ok((await observations(co)).rows[0].completed_at);
}
const updated=(await db.query('SELECT * FROM proposal_line_items WHERE id=$1',[target])).rows[0];
assert.equal(updated.quantity,'3');assert.equal(updated.unit_price,'650');assert.equal(Number(updated.line_total),1950);assert.equal(updated.labor_total,'160');assert.equal(updated.is_hidden,true);
const modifier=(await observations(224)).rows[0];assert.equal(modifier.before_scope_hash,modifier.after_scope_hash,'no-change modifier application remains a diagnostic, not an error');
for(const role of ['anon','authenticated'])assert.equal((await db.query("SELECT has_table_privilege($1,'techsafe_source.application_observer_controls','SELECT,INSERT,UPDATE,DELETE') AS allowed",[role])).rows[0].allowed,false);
assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE '%techsafe%'")).rows[0].n,0);
console.log('Opt-in observer hook passed: disabled by default, original business body/attributes preserved, observed actual save, recording/helper/control failures isolated, original calculation/status errors retained, paused/off behavior, rollback and duplicate-add semantics unchanged.');
}finally{await db.close();}
