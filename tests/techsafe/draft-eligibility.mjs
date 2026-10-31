import assert from 'node:assert/strict';
import fs from 'node:fs';
import {assessDraftEligibility as assess} from '../../supabase/functions/_shared/techsafe-draft-eligibility.mjs';
const input=()=>({organizationId:'org',order:{id:'order',proposal_id:'proposal',organization_id:'org',project_id:null,status:'active'},completion:{asOfDate:'2026-10-31',project:null}});
for(const status of ['pending_deposit','pending_po','planning','active','complete','closed']){
 const i=input();i.order.status=status;assert.equal(assess(i).eligible,['complete','closed'].includes(status));
 i.order.project_id='project';i.completion.project={id:'project',organization_id:'org',sales_order_id:'order',substantial_completion_date:'2026-10-31'};
 assert.equal(assess(i).eligible,true,'Recorded substantial completion does not require payment or final closure');
 i.completion.project.substantial_completion_date='2026-11-01';assert.equal(assess(i).eligible,false);
}
const linked=input();linked.order.project_id='project';linked.completion.project={id:'project',organization_id:'org',sales_order_id:'order',substantial_completion_date:'2026-10-30'};assert.equal(assess(linked).eligible,true);
for(const key of ['id','organization_id','sales_order_id']){const i=structuredClone(linked);i.completion.project[key]='other';assert.equal(assess(i).eligible,false);}
for(const value of [undefined,'','2026-02-29','2026-11-31','0000-01-01','infinity','2026-10-31T00:00:00Z']){const i=structuredClone(linked);i.completion.project.substantial_completion_date=value;assert.equal(assess(i).eligible,false);}
const leap=structuredClone(linked);leap.completion.asOfDate='2028-02-29';leap.completion.project.substantial_completion_date='2028-02-29';assert.equal(assess(leap).eligible,true);
for(const change of [i=>{delete i.completion;},i=>{delete i.order.project_id;},i=>{i.completion.asOfDate='invalid';},i=>{i.order.status='cancelled';}]){const i=input();i.order.status='complete';change(i);assert.equal(assess(i).eligible,false);}
assert.equal(assess(null).eligible,false);
console.log('Draft eligibility passed: substantially complete/complete/closed only, no payment or Test & Tune requirement, linked/date bounds, future holds and fail-closed missing evidence.');

export async function testDraftEligibilitySource(f){
 const {db,id,org,other,actor,outsider,order,proposal,connection}=f;
 await db.exec('CREATE TABLE projects(id uuid PRIMARY KEY,organization_id uuid,sales_order_id uuid,substantial_completion_date date);ALTER TABLE sales_orders ADD COLUMN project_id uuid;');
 await db.exec(fs.readFileSync('supabase/migrations/20261031202439_techsafe_substantial_completion_draft_gate.sql','utf8'));
 await db.query("SELECT set_config('test.actor',$1,false)",[actor]);
 const read=async(c=connection,o=order)=>(await db.query('SELECT techsafe_source.read_order_draft_candidate($1,$2) AS model',[c,o])).rows[0].model;
 for(const status of ['pending_deposit','pending_po','planning','active','unknown']){await db.query('UPDATE sales_orders SET status=$1 WHERE id=$2',[status,order]);assert.equal(await read(),null,status);}
 for(const status of ['complete','closed']){await db.query('UPDATE sales_orders SET status=$1 WHERE id=$2',[status,order]);const m=await read();assert.ok(m);assert.equal(assess(m).eligible,true);assert.equal(m.completion.project,null);assert.equal(m.quoteReady,false);}
 await db.query('INSERT INTO projects VALUES($1,$2,$3,CURRENT_DATE+1)',[id(80),org,order]);await db.query("UPDATE sales_orders SET project_id=$1,status='active' WHERE id=$2",[id(80),order]);assert.equal(await read(),null);
 await db.query("UPDATE sales_orders SET status='complete' WHERE id=$1",[order]);assert.equal(await read(),null,'An explicit future milestone must not be overridden');
 await db.exec('UPDATE projects SET substantial_completion_date=CURRENT_DATE');await db.query("UPDATE sales_orders SET status='active' WHERE id=$1",[order]);
 const ready=await read();assert.ok(ready);assert.equal(assess(ready).eligible,true);assert.equal(ready.order.project_id,id(80));assert.equal(ready.completion.project.sales_order_id,order);
 await db.exec('UPDATE projects SET substantial_completion_date=CURRENT_DATE-1');assert.notEqual((await read()).sourceFingerprint,ready.sourceFingerprint);
 await db.exec('UPDATE projects SET substantial_completion_date=NULL');assert.equal(await read(),null,'Clearing the milestone on an active order holds the candidate');
 await db.exec('UPDATE projects SET substantial_completion_date=CURRENT_DATE');
 for(const update of ["organization_id='"+other+"'","sales_order_id='"+id(999)+"'","substantial_completion_date='infinity'","substantial_completion_date='-infinity'"]){await db.exec('BEGIN');await db.exec('UPDATE projects SET '+update);assert.equal(await read(),null);await db.exec('ROLLBACK');}
 await db.exec('BEGIN');await db.query('UPDATE sales_orders SET project_id=$1 WHERE id=$2',[id(999),order]);assert.equal(await read(),null);await db.exec('ROLLBACK');
 for(const update of ["enabled=false","status='paused'","status='revoked'","last_verified_at=now()-interval '6 minutes'"]){await db.exec('BEGIN');await db.exec('UPDATE techsafe_source.integration_connections SET '+update);assert.equal(await read(),null);await db.exec('ROLLBACK');}
 assert.equal(await read(id(999)),null);assert.equal(await read(connection,id(999)),null);
 await db.query("SELECT set_config('test.actor',$1,false)",[outsider]);assert.equal(await read(),null);await db.query("SELECT set_config('test.actor',$1,false)",[actor]);
 for(const role of ['anon','authenticated','service_role']){await db.exec('BEGIN;SET LOCAL ROLE '+role);await assert.rejects(read(),e=>e.code==='42501');await db.exec('ROLLBACK');}
 const before=JSON.stringify((await db.query('SELECT to_jsonb(so) AS row FROM sales_orders so')).rows);await read();assert.equal(JSON.stringify((await db.query('SELECT to_jsonb(so) AS row FROM sales_orders so')).rows),before);
 const a=(await db.query("SELECT prosecdef,provolatile,proconfig FROM pg_proc WHERE oid='techsafe_source.read_order_draft_candidate(uuid,uuid)'::regprocedure")).rows[0];assert.equal(a.prosecdef,false);assert.equal(a.provolatile,'s');assert.deepEqual(a.proconfig,['search_path=""']);
 console.log('Private draft candidate gate passed: source readiness before candidate reads, bound project milestones, future/reopened holds, current healthy authorization, denied API roles, changed fingerprints and no MJV source writes.');
}
