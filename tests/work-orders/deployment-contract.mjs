import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
const snapshot=JSON.parse(await readFile(new URL('./live-booking-columns.json',import.meta.url),'utf8'));
const columns=new Map(snapshot.tables.map(t=>[t.table,new Set(t.columns)]));
const migrationDir=new URL('../../supabase/migrations/',import.meta.url);
const names=['20261001134611_project_task_visit_handoff.sql','20261006141909_service_request_fast_intake.sql',(await readdir(migrationDir)).find(n=>n.endsWith('_complete_work_order_scheduling.sql'))];
let checked=0;
for(const name of names){
 const sql=await readFile(new URL(name,migrationDir),'utf8');
 for(const statement of sql.split(';')){
  const table=statement.match(/ALTER TABLE public\.(\w+)/i)?.[1];
  if(table&&columns.has(table))for(const match of statement.matchAll(/ADD COLUMN (?:IF NOT EXISTS )?(\w+)/gi))columns.get(table).add(match[1]);
 }
 for(const match of sql.matchAll(/INSERT INTO public\.(\w+)\s*\(([^)]+)\)/gi)){
  if(!columns.has(match[1]))continue; // New tables are checked by the PostgreSQL migration test.
  for(const field of match[2].split(',').map(s=>s.trim()))assert.ok(columns.get(match[1]).has(field),`${name}: ${match[1]}.${field} absent from live schema and prerequisites`);
  checked++;
 }
}
assert.ok(checked>=8,'Check existing-table writes across all release migrations');
for(const [table,field] of [['work_orders','creation_request_id'],['work_orders','creation_sequence'],['work_order_tasks','visit_instructions'],['service_requests','earliest_date']])assert.ok(columns.get(table).has(field));
console.log(`Release insert contracts match audited MJV columns plus handoff/intake prerequisites (${checked} statements).`);
