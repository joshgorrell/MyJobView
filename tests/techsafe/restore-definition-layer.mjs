import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {captureKinds,captureQuery} from '../../scripts/techsafe/catalog-capture.mjs';
import {compileTableLayer} from '../../scripts/techsafe/restore-table-layer.mjs';
import {compileDefinitionLayer,rehearseDefinitionLayer} from '../../scripts/techsafe/restore-definition-layer.mjs';
const source=new PGlite(),destination=new PGlite();
async function capture(db){
 const pages=[];for(const kind of captureKinds)for(let offset=0;;offset+=25){
  const rows=(await db.query(captureQuery(kind,offset,25))).rows;if(!rows.length)break;pages.push({kind,offset,rows});
 }return pages;
}
async function tableLayer(db,pages,metadata={}){
 await db.exec('BEGIN; SET LOCAL search_path=public,pg_catalog;');
 for(const item of compileTableLayer(pages,metadata).statements)await db.exec(item.sql);
 await db.exec('COMMIT;');
}
try{
await source.exec(`CREATE SCHEMA auth;CREATE SCHEMA flow_private;
CREATE FUNCTION flow_private.no_table_schema() RETURNS integer LANGUAGE sql AS $$SELECT 1$$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT NULL::uuid$$;
CREATE TABLE public.canary(n integer);INSERT INTO public.canary VALUES(0);
CREATE FUNCTION public.never_invoke() RETURNS integer LANGUAGE plpgsql AS $$BEGIN UPDATE public.canary SET n=n+1;RAISE EXCEPTION 'INVOKED';END$$;
CREATE FUNCTION public.external_candidate() RETURNS text LANGUAGE sql AS $$SELECT 'https://example.invalid'::text$$;
CREATE FUNCTION public.deferred_dependency() RETURNS integer LANGUAGE sql AS $$SELECT 7$$;
CREATE PROCEDURE public.never_call() LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'CALLED';END$$;
CREATE TABLE public.defaults_fixture(id uuid DEFAULT auth.uid(),n integer DEFAULT public.never_invoke(),
 normal integer DEFAULT 9,dependency integer DEFAULT public.deferred_dependency());`);
const pages=await capture(source);await tableLayer(destination,pages);
const plan=compileDefinitionLayer(pages),result=await rehearseDefinitionLayer(destination,plan);
assert.equal(result.failures.length,1);assert.equal(result.failures[0].column,'id');assert.equal(result.failures[0].sqlState,'3F000');
assert.ok(result.deferred.some(x=>x.identity==='public.external_candidate()'));
assert.equal((await destination.query('SELECT count(*)::int AS n FROM public.canary')).rows[0].n,0);
assert.equal((await source.query('SELECT n FROM public.canary')).rows[0].n,0);
assert.equal((await destination.query("SELECT to_regprocedure('public.external_candidate()') AS routine")).rows[0].routine,null);
assert.equal((await destination.query(`SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace,
 LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE n.nspname='public' AND a.grantee=0 AND a.privilege_type='EXECUTE'`)).rows[0].n,0);
assert.equal(result.runtimeTestsAllowed,false);assert.equal(result.quoteReady,false);
const destinationPages=await capture(destination);
for(const page of pages.filter(p=>p.kind==='routines'))for(const row of page.rows){
 if(!result.applied.some(x=>x.stage==='routines'&&x.identity===row.identity))continue;
 const target=destinationPages.flatMap(p=>p.kind==='routines'?p.rows:[]).find(r=>r.identity===row.identity);
 assert.equal(JSON.parse(target.payload_text).definition,JSON.parse(row.payload_text).definition);
}
// Installing a function body with a missing dependency must never mean it was verified.
await destination.exec('DROP FUNCTION public.deferred_dependency() CASCADE;');
const damaged=structuredClone(pages);damaged[0].rows[0].payload_text+=' ';assert.throws(()=>compileDefinitionLayer(damaged),/hash mismatch/);

if(process.argv[2]){
 const directory=process.argv[2],captured=captureKinds.flatMap(kind=>JSON.parse(fs.readFileSync(path.join(directory,kind+'.json'),'utf8')).pages);
 const metadata=JSON.parse(fs.readFileSync(path.join(directory,'extra-metadata.json'),'utf8'));
 const rehearsal=new PGlite();try{
  await tableLayer(rehearsal,captured,metadata);
  const actual=await rehearseDefinitionLayer(rehearsal,compileDefinitionLayer(captured));
  const restored=await capture(rehearsal),byKey=new Map(restored.flatMap(p=>p.rows.map(r=>[p.kind+':'+r.identity,JSON.parse(r.payload_text)])));
  const original=new Map(captured.flatMap(p=>p.rows.map(r=>[p.kind+':'+r.identity,JSON.parse(r.payload_text)])));
  for(const item of actual.applied){
   if(item.stage==='routines')assert.equal(byKey.get('routines:'+item.identity).definition,original.get('routines:'+item.identity).definition,item.identity);
   else if(item.stage==='defaults')assert.equal(byKey.get('relations:'+item.identity).columns.find(c=>c.name===item.column).default,
    original.get('relations:'+item.identity).columns.find(c=>c.name===item.column).default,item.identity+'.'+item.column);
  }
  const appliedCounts={};for(const item of actual.applied)appliedCounts[item.stage]=(appliedCounts[item.stage]??0)+1;
  const summary={engine:'PGlite 0.3.14',serverVersion:(await rehearsal.query('SHOW server_version')).rows[0].server_version,
   appliedCounts,definitionsCompared:actual.applied.filter(x=>x.stage!=='schemas').length,failures:actual.failures,deferred:actual.deferred,
   fullBaseline:false,runtimeTestsAllowed:false,restoreApproved:false,quoteReady:false,productionWrites:false};
  console.log(JSON.stringify(summary));
 }finally{await rehearsal.close();}
}
console.log('Definition-layer rehearsal passed: exact installed definitions/defaults, no function/default invocation or row copying, PUBLIC execution revoked, outbound candidates deferred, missing dependencies recorded with SQLSTATE, later statements retained, tampering rejected. Full runtime verification remains pending.');
}finally{await source.close();await destination.close();}
