import assert from 'node:assert/strict';
import fs from 'node:fs';
import {assessDraftEligibility as assess} from '../../supabase/functions/_shared/techsafe-draft-eligibility.mjs';
const update='supabase/migrations/20261101135453_techsafe_precompletion_sales_order_drafts.sql';
const input=()=>({organizationId:'org',order:{id:'order',proposal_id:'proposal',organization_id:'org',status:'active'}});
for(const status of ['pending_deposit','pending_po','planning','active','complete','closed']){
 const i=input();i.order.status=status;assert.equal(assess(i).eligible,true,status);
 Object.defineProperty(i,'completion',{get(){throw Error('Completion must not control draft visibility');}});
 Object.defineProperty(i.order,'project_id',{get(){throw Error('Project must not control draft visibility');}});
 assert.equal(assess(i).eligible,true);
}
for(const status of ['draft','designing','cancelled','deleted','unknown',null,undefined]){const i=input();i.order.status=status;assert.equal(assess(i).eligible,false);}
for(const change of [i=>{i.order.id='';},i=>{i.order.proposal_id=null;},i=>{i.order.organization_id='other';},i=>{delete i.order;}]){const i=input();change(i);assert.equal(assess(i).eligible,false);}
assert.equal(assess(null).eligible,false);
console.log('Draft eligibility passed: supported sales orders before/during/after work, no completion/project/date reads, bound identities and fail-closed unknown states. Approval proof and checkout remain separate.');

export async function testDraftEligibilitySource(f){
 const {db,id,org,other,actor,outsider,order,connection}=f;
 await db.exec('CREATE TABLE projects(id uuid PRIMARY KEY,organization_id uuid,sales_order_id uuid,substantial_completion_date date);ALTER TABLE sales_orders ADD COLUMN project_id uuid;');
 await db.exec(fs.readFileSync('supabase/migrations/20261031202439_techsafe_substantial_completion_draft_gate.sql','utf8'));
 const old=(await db.query("SELECT pg_get_functiondef('techsafe_source.read_order_draft_candidate(uuid,uuid)'::regprocedure) AS definition")).rows[0].definition;
 await db.exec('BEGIN');await db.exec(old.replace("so.status IN ('complete','closed')","so.status IN ('closed')"));
 await assert.rejects(db.exec(fs.readFileSync(update,'utf8')),/Review changed Techsafe draft candidate reader/);await db.exec('ROLLBACK');
 await db.exec(fs.readFileSync(update,'utf8'));
 await db.query("SELECT set_config('test.actor',$1,false)",[actor]);
 const read=async(c=connection,o=order)=>(await db.query('SELECT techsafe_source.read_order_draft_candidate($1,$2) AS model',[c,o])).rows[0].model;
 for(const status of ['pending_deposit','pending_po','planning','active','complete','closed']){
  await db.query('UPDATE sales_orders SET status=$1 WHERE id=$2',[status,order]);const m=await read();assert.ok(m,status);assert.equal(assess(m).eligible,true);assert.equal(Object.hasOwn(m,'completion'),false);assert.equal(m.quoteReady,false);
 }
 for(const status of ['unknown','cancelled','deleted','draft']){await db.query('UPDATE sales_orders SET status=$1 WHERE id=$2',[status,order]);assert.equal(await read(),null,status);}
 await db.query("UPDATE sales_orders SET status='active',project_id=$1 WHERE id=$2",[id(80),order]);
 const baseline=await read();assert.ok(baseline,'Project existence is not draft evidence');
 await db.query('INSERT INTO projects VALUES($1,$2,$3,NULL)',[id(80),org,order]);
 for(const sql of ['UPDATE projects SET substantial_completion_date=CURRENT_DATE+100','UPDATE projects SET substantial_completion_date=CURRENT_DATE',
  'UPDATE projects SET substantial_completion_date=NULL',"UPDATE projects SET substantial_completion_date='infinity'","UPDATE projects SET organization_id='"+other+"'","UPDATE projects SET sales_order_id='"+id(999)+"'"]){
  await db.exec('BEGIN');await db.exec(sql);assert.deepEqual(await read(),baseline,'Project/completion edits are irrelevant to draft equipment');await db.exec('ROLLBACK');
 }
 for(const update of ["enabled=false","status='paused'","status='revoked'","last_verified_at=now()-interval '6 minutes'"]){await db.exec('BEGIN');await db.exec('UPDATE techsafe_source.integration_connections SET '+update);assert.equal(await read(),null);await db.exec('ROLLBACK');}
 assert.equal(await read(id(999)),null);assert.equal(await read(connection,id(999)),null);
 await db.query("SELECT set_config('test.actor',$1,false)",[outsider]);assert.equal(await read(),null);await db.query("SELECT set_config('test.actor',$1,false)",[actor]);
 for(const role of ['anon','authenticated','service_role']){await db.exec('BEGIN;SET LOCAL ROLE '+role);await assert.rejects(read(),e=>e.code==='42501');await db.exec('ROLLBACK');}
 const before=JSON.stringify((await db.query('SELECT to_jsonb(so) AS row FROM sales_orders so')).rows);await read();assert.equal(JSON.stringify((await db.query('SELECT to_jsonb(so) AS row FROM sales_orders so')).rows),before);
 const a=(await db.query("SELECT prosecdef,provolatile,proconfig FROM pg_proc WHERE oid='techsafe_source.read_order_draft_candidate(uuid,uuid)'::regprocedure")).rows[0];assert.equal(a.prosecdef,false);assert.equal(a.provolatile,'s');assert.deepEqual(a.proconfig,['search_path=""']);
 console.log('Private draft candidate gate passed: early sales orders without completion/project prerequisites, exact upgrade guard, date-independent content, connection/tenant/API denial and no MJV source writes.');
}
