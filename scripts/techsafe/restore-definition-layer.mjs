import {summarizeCapture} from './catalog-capture.mjs';
const qi=s=>'"'+s.replaceAll('"','""')+'"';
// Offline SQL compiler for reviewed captures, never a connected-database runner.
// Bodies are installed with validation deferred, and must not be invoked yet.
export function compileDefinitionLayer(pages){
 summarizeCapture(pages);
 const statements=[],deferred=[];
 const schemas=new Set();
 const allowedSchemas=['public','private','flow_private','pto_private','sales_credit_private','time_private','work_order_private','jobs'];
 for(const page of pages.filter(p=>p.kind==='routines'))for(const row of page.rows){
  const schema=JSON.parse(row.payload_text).schema;
  if(!allowedSchemas.includes(schema))throw new Error('Unsupported application schema');
  if(schema!=='public')schemas.add(schema);
 }
 for(const schema of [...schemas].sort())statements.push({stage:'schemas',identity:schema,sql:`CREATE SCHEMA IF NOT EXISTS ${qi(schema)};`});
 for(const page of pages)for(const row of page.rows){
  const o=JSON.parse(row.payload_text);
  if(page.kind==='routines'){
   if(!['sql','plpgsql'].includes(o.language)||!['f','p'].includes(o.kind))throw new Error('Unsupported routine');
   if(o.outboundReview!==false){deferred.push({stage:'routines',identity:row.identity,reason:'outbound-review'});continue;}
   if(typeof o.definition!=='string'||!o.definition.startsWith('CREATE OR REPLACE '))throw new Error('Missing routine definition');
   statements.push({stage:'routines',identity:row.identity,sql:o.definition,
    quarantineSql:`REVOKE ALL ON ${o.kind==='p'?'PROCEDURE':'FUNCTION'} ${row.identity} FROM PUBLIC;`});
  }else if(page.kind==='relations'&&o.kind==='r'){
   for(const c of o.columns??[]){
    if(c.default===null||c.generated||c.identity)continue;
    statements.push({stage:'defaults',identity:row.identity,column:c.name,
     sql:`ALTER TABLE ${qi(o.schema)}.${qi(o.name)} ALTER COLUMN ${qi(c.name)} SET DEFAULT ${c.default};`});
   }
  }
 }
 const rank={schemas:0,routines:1,defaults:2};
 statements.sort((a,b)=>rank[a.stage]-rank[b.stage]);
 return {format:'mjv-definition-layer-v1',statements,deferred,fullBaseline:false,
  runtimeTestsAllowed:false,restoreApproved:false,quoteReady:false,
  warning:'Deferred body validation and omitted outbound candidates do not verify routine dependencies, permissions or safe execution.'};
}

// Only receives a newly constructed local PGlite instance from the test runner.
// This helper is deliberately not a Supabase client and cannot deploy anything.
export async function rehearseDefinitionLayer(db,plan){
 const applied=[],failures=[];
 await db.exec('BEGIN; SET LOCAL search_path=public,pg_catalog; SET LOCAL check_function_bodies=off;');
 try{
  for(const item of plan.statements){
   await db.exec('SAVEPOINT definition_item;');
   try{
    await db.exec(item.sql);
    if(item.quarantineSql)await db.exec(item.quarantineSql);
    await db.exec('RELEASE SAVEPOINT definition_item;');
    applied.push({stage:item.stage,identity:item.identity,...(item.column?{column:item.column}:{})});
   }catch(error){
    await db.exec('ROLLBACK TO SAVEPOINT definition_item; RELEASE SAVEPOINT definition_item;');
    failures.push({stage:item.stage,identity:item.identity,...(item.column?{column:item.column}:{}),sqlState:error.code??'unknown'});
   }
  }
  await db.exec('COMMIT;');
 }catch(error){await db.exec('ROLLBACK;');throw error;}
 return {applied,failures,deferred:plan.deferred,fullBaseline:false,runtimeTestsAllowed:false,restoreApproved:false,quoteReady:false};
}
