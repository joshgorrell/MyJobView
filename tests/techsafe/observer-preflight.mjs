import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {applicationObservationDb} from './fixtures/application-observation-db.mjs';
const capture=JSON.parse(fs.readFileSync('tests/techsafe/fixtures/source-schema-preflight.json','utf8'));
const sql=fs.readFileSync('scripts/techsafe/observer-preflight.sql','utf8');
const plan=fs.readFileSync('scripts/techsafe/observer-plan.sql','utf8');
const planStatement=plan.replace(/--[^\n]*/g,'').trim();
assert.match(planStatement,/^EXPLAIN \(FORMAT JSON, COSTS TRUE\)/);
assert.doesNotMatch(planStatement,/\b(?:ANALYZE|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|CALL|DO)\b/i);
assert.doesNotMatch(planStatement,/techsafe_source\.integration_connections|\bp_co\b/);
assert.equal(capture.preflightResult.structuralChecksPassed,true);
assert.equal(capture.preflightResult.deploymentApproved,false);
assert.equal(capture.preflightResult.quoteReady,false);
const normalized=s=>s.replace(/\s+/g,' ').trim();
const sha=s=>createHash('sha256').update(normalized(s)).digest('hex');
assert.equal(sha(capture.applier.body),'4bfa9641b1dc7fe4bddd52148b025597f8d775852eeb656b1cadaab7d2c997bd');
assert.equal(capture.applier.securityDefiner,true);assert.deepEqual(capture.applier.config,['search_path=public']);
assert.equal(capture.requiredColumns.length,23);assert.equal(capture.parentIndexes.length,3);
assert.equal(Object.values(capture.inspectedColumnCounts).reduce((a,b)=>a+b,0),432);
assert.match(sql,/^-- READ ONLY/);assert.doesNotMatch(sql.replace(/--[^\n]*/g,''),/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|CALL|DO|ANALYZE)\b/i);
const {db}=await applicationObservationDb();
try{
// Only fill the structural fixture gaps; this is not a complete live clone.
await db.exec('ALTER TABLE proposal_line_items ADD COLUMN task_completed boolean;ALTER TABLE proposal_line_items ADD COLUMN tasks_seeded_at timestamptz;CREATE INDEX preflight_co_parent ON change_orders(sales_order_id);CREATE INDEX preflight_item_parent ON change_order_line_items(change_order_id);CREATE INDEX preflight_scope_parent ON proposal_line_items(proposal_id);');
const inspect=async()=>{const r=(await db.query(sql)).rows[0].preflight;assert.equal(r.deploymentApproved,false);assert.equal(r.quoteReady,false);assert.equal(r.fullSchemaScenariosValidated,false);assert.equal(r.loadAndConcurrencyValidated,false);return r;};
assert.equal((await inspect()).structuralChecksPassed,true);
await db.exec(fs.readFileSync('supabase/migrations/20261030184035_techsafe_opt_in_application_observer.sql','utf8'));
const after=await inspect();assert.equal(after.structuralChecksPassed,true);assert.equal(after.observerCodePresent,true);assert.equal(after.functionImplementationRecognized,true);
await db.exec('BEGIN');await db.exec('DROP INDEX preflight_co_parent');const noIndex=await inspect();assert.equal(noIndex.structuralChecksPassed,false);assert.deepEqual(noIndex.missingParentIndexes,[{table_name:'change_orders',column_name:'sales_order_id'}]);await db.exec('ROLLBACK');
await db.exec('BEGIN');await db.exec('ALTER TABLE profiles ALTER COLUMN is_active TYPE text USING is_active::text');const wrongType=await inspect();assert.equal(wrongType.structuralChecksPassed,false);assert.equal(wrongType.missingOrChangedColumns[0].column_name,'is_active');await db.exec('ROLLBACK');
await db.exec('BEGIN');await db.exec('CREATE ROLE observer_test_owner;ALTER FUNCTION public.apply_change_order(uuid) OWNER TO observer_test_owner');assert.equal((await inspect()).structuralChecksPassed,false);await db.exec('ROLLBACK');
const definition=(await db.query("SELECT pg_get_functiondef('public.apply_change_order(uuid)'::regprocedure) AS source")).rows[0].source;
await db.exec('BEGIN');await db.exec(definition.replace(/is_hidden\s*=\s*true/,'is_hidden=false'));const businessDrift=await inspect();assert.equal(businessDrift.structuralChecksPassed,false);assert.equal(businessDrift.businessFunctionMatchesBaseline,false);await db.exec('ROLLBACK');
// A correct business body must not hide drift inside ignored observer markers.
await db.exec('BEGIN');await db.exec(definition.replace('v_techsafe_observation:=NULL;','RAISE EXCEPTION \'Unsafe observer\';'));const observerDrift=await inspect();assert.equal(observerDrift.businessFunctionMatchesBaseline,true);assert.equal(observerDrift.functionImplementationRecognized,false);assert.equal(observerDrift.structuralChecksPassed,false);await db.exec('ROLLBACK');
console.log('Observer preflight passed: captured live baseline/23 columns/3 parent indexes, baseline and known observer recognition, missing index/type/business/observer drift detection, catalog-only SQL and no deployment/quote authorization.');
}finally{await db.close();}
