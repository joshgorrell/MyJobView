import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {captureKinds,captureQuery} from '../../scripts/techsafe/catalog-capture.mjs';
import {compileTableLayer} from '../../scripts/techsafe/restore-table-layer.mjs';
import {compileDefinitionLayer,rehearseDefinitionLayer} from '../../scripts/techsafe/restore-definition-layer.mjs';
import {compileConstraintLayer,rehearseConstraintLayer} from '../../scripts/techsafe/restore-constraint-layer.mjs';
import {compileLocalAuthInterface} from '../../scripts/techsafe/local-auth-interface.mjs';
async function capture(db){
 const pages=[];for(const kind of captureKinds)for(let offset=0;;offset+=25){
  const rows=(await db.query(captureQuery(kind,offset,25))).rows;if(!rows.length)break;pages.push({kind,offset,rows});
 }return pages;
}
async function prepare(db,pages,metadata={}){
 await db.exec('BEGIN; SET LOCAL search_path=public,pg_catalog;');
 for(const item of compileTableLayer(pages,metadata).statements)await db.exec(item.sql);
 await db.exec('COMMIT;');
 return rehearseDefinitionLayer(db,compileDefinitionLayer(pages));
}
function verify(restored,original,result){
 const mismatches=[];
 const target=new Map(restored.flatMap(p=>p.kind==='relations'?p.rows.map(r=>[r.identity,JSON.parse(r.payload_text)]):[]));
 const source=new Map(original.flatMap(p=>p.kind==='relations'?p.rows.map(r=>[r.identity,JSON.parse(r.payload_text)]):[]));
 for(const item of result.applied){
  const field=item.stage==='indexes'?'indexes':'constraints';
  const expected=source.get(item.identity)[field].find(x=>x.name===item.name);
  const actual=target.get(item.identity)[field].find(x=>x.name===item.name);assert.ok(actual,item.identity+'.'+item.name);
  try{assert.deepEqual(actual,expected,item.identity+'.'+item.name);}
  catch{mismatches.push({stage:item.stage,identity:item.identity,name:item.name,
   differingFields:[...new Set([...Object.keys(actual),...Object.keys(expected)])].filter(k=>JSON.stringify(actual[k])!==JSON.stringify(expected[k]))});}
 }
 return mismatches;
}
const source=new PGlite(),destination=new PGlite();
try{
await source.exec(`CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE TABLE public.parent(id integer PRIMARY KEY,code text UNIQUE,auth_id uuid REFERENCES auth.users(id));
CREATE TABLE public.child(id integer PRIMARY KEY,parent_id integer,qty integer CHECK(qty>=0),name text,
 CONSTRAINT parent_link FOREIGN KEY(parent_id) REFERENCES public.parent(id) DEFERRABLE INITIALLY DEFERRED);
ALTER TABLE public.child ADD CONSTRAINT name_present CHECK(length(name)>0) NOT VALID;
CREATE INDEX child_name_idx ON public.child USING btree(lower(name)) WHERE qty>0;
CREATE INDEX child_qty_idx ON public.child(qty DESC) INCLUDE(name);
CREATE FUNCTION public.constraint_must_not_run() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'TRIGGER INVOKED';END$$;
CREATE CONSTRAINT TRIGGER deferred_effect AFTER INSERT ON public.child DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.constraint_must_not_run();`);
const pages=await capture(source);await prepare(destination,pages);
await destination.exec('CREATE INDEX child_name_idx ON public.child(parent_id)');
const plan=compileConstraintLayer(pages),result=await rehearseConstraintLayer(destination,plan);
assert.equal(result.failures.length,2);
assert.ok(result.failures.some(x=>x.stage==='foreignKeys'&&x.sqlState==='3F000'));
assert.ok(result.failures.some(x=>x.name==='child_name_idx'&&x.reason==='index-definition-mismatch'));
assert.ok(result.deferred.some(x=>x.name==='deferred_effect'));
assert.ok(result.applied.some(x=>x.name==='parent_pkey'&&x.stage==='indexes'&&x.reused));
assert.ok(result.applied.some(x=>x.name==='child_qty_idx'&&x.stage==='indexes'&&!x.reused));
assert.deepEqual(verify(await capture(destination),pages,result),[]);
assert.equal((await destination.query('SELECT count(*)::int AS n FROM pg_trigger WHERE NOT tgisinternal')).rows[0].n,0);
await destination.exec("INSERT INTO public.parent(id,code) VALUES(1,'one');INSERT INTO public.child(id,parent_id,qty,name) VALUES(1,1,1,'valid')");
await assert.rejects(destination.exec("INSERT INTO public.child(id,parent_id,qty,name) VALUES(2,999,1,'missing parent')"),e=>e.code==='23503');
await assert.rejects(destination.exec("INSERT INTO public.parent(id,code) VALUES(1,'duplicate')"),e=>e.code==='23505');
await assert.rejects(destination.exec("INSERT INTO public.child(id,qty,name) VALUES(3,-1,'negative')"),e=>e.code==='23514');
await assert.rejects(destination.exec("INSERT INTO public.child(id,qty,name) VALUES(4,1,'')"),e=>e.code==='23514');
assert.equal(result.fullBaseline,false);assert.equal(result.runtimeTestsAllowed,false);assert.equal(result.quoteReady,false);
const damaged=structuredClone(pages);damaged[0].rows[0].payload_text+=' ';assert.throws(()=>compileConstraintLayer(damaged),/hash mismatch/);
const invalid=structuredClone(pages),row=invalid.flatMap(p=>p.kind==='relations'?p.rows:[]).find(r=>r.identity==='public.child');
const payload=JSON.parse(row.payload_text);payload.indexes[0].valid=false;row.payload_text=JSON.stringify(payload);row.content_hash=createHash('sha256').update(row.payload_text).digest('hex');
assert.throws(()=>compileConstraintLayer(invalid),/Invalid or incomplete/);
if(process.argv[2]){
 const directory=process.argv[2],captured=captureKinds.flatMap(kind=>JSON.parse(fs.readFileSync(path.join(directory,kind+'.json'),'utf8')).pages);
 const metadata=JSON.parse(fs.readFileSync(path.join(directory,'extra-metadata.json'),'utf8'));
 const db=new PGlite();try{
  let localAuthInterface=false;
  if(process.argv[3]==='--local-auth-interface'){
   const record=JSON.parse(fs.readFileSync('tests/techsafe/fixtures/auth-interface-catalog.json','utf8'));
   const auth=compileLocalAuthInterface(record);
   await db.exec('BEGIN;');for(const sql of auth.statements)await db.exec(sql);await db.exec('COMMIT;');localAuthInterface=true;
  }else if(process.argv[3])throw new Error('Unsupported rehearsal option');
  const prerequisite=await prepare(db,captured,metadata),actual=await rehearseConstraintLayer(db,compileConstraintLayer(captured));
  const restored=await capture(db),mismatches=verify(restored,captured,actual);
  const byKey=new Map(restored.flatMap(p=>p.rows.map(r=>[p.kind+':'+r.identity,JSON.parse(r.payload_text)])));
  const original=new Map(captured.flatMap(p=>p.rows.map(r=>[p.kind+':'+r.identity,JSON.parse(r.payload_text)])));
  let prerequisiteDefinitionsCompared=0;
  for(const item of prerequisite.applied){
   if(item.stage==='schemas')continue;
   if(item.stage==='routines')assert.equal(byKey.get('routines:'+item.identity).definition,original.get('routines:'+item.identity).definition,item.identity);
   else assert.equal(byKey.get('relations:'+item.identity).columns.find(c=>c.name===item.column).default,
    original.get('relations:'+item.identity).columns.find(c=>c.name===item.column).default,item.identity+'.'+item.column);
   prerequisiteDefinitionsCompared++;
  }
  const appliedCounts={};for(const item of actual.applied)appliedCounts[item.stage]=(appliedCounts[item.stage]??0)+1;
  const prerequisiteAppliedCounts={};for(const item of prerequisite.applied)prerequisiteAppliedCounts[item.stage]=(prerequisiteAppliedCounts[item.stage]??0)+1;
  console.log(JSON.stringify({engine:'PGlite 0.3.14',localAuthInterface,nativeAuthService:false,serverVersion:(await db.query('SHOW server_version')).rows[0].server_version,
   appliedCounts,definitionsCompared:actual.applied.length,exactDefinitionsMatched:actual.applied.length-mismatches.length,definitionMismatches:mismatches,reusedIndexes:actual.applied.filter(x=>x.reused).length,
   failures:actual.failures,deferred:actual.deferred,prerequisiteAppliedCounts,prerequisiteDefinitionsCompared,prerequisiteFailures:prerequisite.failures,
   fullBaseline:false,runtimeTestsAllowed:false,restoreApproved:false,quoteReady:false,productionWrites:false}));
 }finally{await db.close();}
}
console.log('Synthetic constraint/index checks passed: native definition/validation comparison, key ordering, backing-index reuse, mismatch rejection, missing-managed dependency isolation, deferred business triggers, FK/unique/check enforcement and payload integrity. Optional full-capture differences are reported above; no source application scenarios were run.');
}finally{await source.close();await destination.close();}
