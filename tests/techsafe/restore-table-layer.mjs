import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {captureQuery,captureKinds} from '../../scripts/techsafe/catalog-capture.mjs';
import {compileTableLayer} from '../../scripts/techsafe/restore-table-layer.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
const source=new PGlite(),destination=new PGlite();
try{
await source.exec(`CREATE SCHEMA private;
CREATE TYPE public.review_status AS ENUM ('new','don''t');
CREATE SEQUENCE public.large_sequence AS bigint START 9007199254740993 MAXVALUE 9223372036854775807;
CREATE TABLE public.records(id bigint GENERATED ALWAYS AS IDENTITY (START WITH 73 INCREMENT BY 3),
 amount numeric(12,2) NOT NULL DEFAULT 50,quantity integer, total numeric GENERATED ALWAYS AS (amount*quantity) STORED,
 status public.review_status, labels text[] COLLATE "C", PRIMARY KEY(id));
CREATE TABLE private."quoted""table"("quoted""column" text);
CREATE FUNCTION public.must_not_run() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'SIDE EFFECT';END$$;
CREATE TRIGGER never_restore BEFORE INSERT ON public.records FOR EACH ROW EXECUTE FUNCTION public.must_not_run();
CREATE VIEW public.deferred_view AS SELECT id FROM public.records;
INSERT INTO private."quoted""table" VALUES ('NEVER_COPY_DATA');`);
const pages=[];
for(const kind of captureKinds){
 for(let offset=0;;offset+=25){const rows=(await source.query(captureQuery(kind,offset,25))).rows;if(!rows.length)break;pages.push({kind,offset,rows});}
}
const identityOwnership=[{sequence:'public.records_id_seq',table:'public.records',column:'id',dependencyKind:'i'}];
const plan=compileTableLayer(pages,{sequenceOwnership:identityOwnership});
assert.equal(plan.counts.tables,2);assert.equal(plan.runtimeTestsAllowed,false);assert.equal(plan.restoreApproved,false);assert.equal(plan.quoteReady,false);
assert.ok(plan.deferred.some(x=>x.kind==='triggers'));assert.ok(plan.deferred.some(x=>x.kind==='default'));assert.ok(plan.deferred.some(x=>x.kind==='view'));
await destination.exec('BEGIN; SET LOCAL search_path=public,pg_catalog;');
for(const item of plan.statements)await destination.exec(item.sql);
await destination.exec('COMMIT;');
const rows=async db=>(await db.query(`SELECT c.relname,a.attname,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull,a.attidentity,a.attgenerated
 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN ('public','private') AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum`)).rows;
assert.deepEqual(await rows(destination),await rows(source));
await destination.exec('INSERT INTO public.records(amount,quantity) VALUES (12.50,3)');
assert.deepEqual((await destination.query('SELECT id::text,total::text FROM public.records')).rows,[{id:'73',total:'37.50'}]);
assert.equal((await destination.query(`SELECT seqstart::text AS start FROM pg_sequence WHERE seqrelid='public.large_sequence'::regclass`)).rows[0].start,'9007199254740993');
assert.equal((await destination.query(`SELECT count(*)::int AS n FROM private."quoted""table"`)).rows[0].n,0);
assert.equal((await destination.query(`SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','private') AND c.relkind='r' AND NOT c.relrowsecurity`)).rows[0].n,0);
assert.equal((await destination.query(`SELECT count(*)::int AS n FROM pg_trigger WHERE NOT tgisinternal`)).rows[0].n,0);
const changed=structuredClone(pages);changed[0].rows[0].payload_text+=' ';assert.throws(()=>compileTableLayer(changed),/hash mismatch/);
assert.throws(()=>compileTableLayer(pages),/Missing identity sequence/);
const unsupported=structuredClone(pages);const row=unsupported.flatMap(p=>p.kind==='relations'?p.rows:[]).find(r=>r.identity==='public.records');
const payload=JSON.parse(row.payload_text);payload.parents=['public.other'];row.payload_text=JSON.stringify(payload);row.content_hash=hash(row.payload_text);
assert.throws(()=>compileTableLayer(unsupported,{sequenceOwnership:identityOwnership}),/Unsupported table structure/);

// Optional private rehearsal: raw source definitions stay outside the repository.
const captureDirectory=process.argv[2];
if(captureDirectory){
 const captured=captureKinds.flatMap(kind=>JSON.parse(fs.readFileSync(path.join(captureDirectory,kind+'.json'),'utf8')).pages);
 const metadata=JSON.parse(fs.readFileSync(path.join(captureDirectory,'extra-metadata.json'),'utf8'));
 const full=compileTableLayer(captured,metadata),rehearsal=new PGlite();
 try{
  await rehearsal.exec('BEGIN; SET LOCAL search_path=public,pg_catalog;');
  for(const item of full.statements)await rehearsal.exec(item.sql);
  await rehearsal.exec('COMMIT;');
  const restored=[];for(let offset=0;;offset+=25){const result=(await rehearsal.query(captureQuery('relations',offset,25))).rows;if(!result.length)break;restored.push(...result);}
  const actual=new Map(restored.map(r=>[r.identity,JSON.parse(r.payload_text)]));
  let columns=0,generated=0,identities=0;
  for(const page of captured.filter(p=>p.kind==='relations'))for(const row of page.rows){
   const original=JSON.parse(row.payload_text);if(!['r','S'].includes(original.kind))continue;
   const target=actual.get(row.identity);assert.ok(target,'Missing '+row.identity);
   if(original.kind==='S'){assert.deepEqual(target.sequence,original.sequence);continue;}
   const project=c=>({name:c.name,type:c.type,notNull:c.notNull,identity:c.identity,generated:c.generated,collation:c.collation,expression:c.generated?c.default:null});
   assert.deepEqual(target.columns.map(project),original.columns.map(project),row.identity);
   assert.equal(target.rls,true);columns+=original.columns.length;
   generated+=original.columns.filter(c=>c.generated).length;identities+=original.columns.filter(c=>c.identity).length;
  }
  const deferredKinds={};for(const item of full.deferred)deferredKinds[item.kind]=(deferredKinds[item.kind]??0)+1;
  const version=(await rehearsal.query('SHOW server_version')).rows[0].server_version;
  console.log(JSON.stringify({privateRehearsal:true,serverVersion:version,...full.counts,columns,generated,identities,statements:full.statements.length,deferred:full.deferred.length,deferredKinds,fullBaseline:false,runtimeTestsAllowed:false}));
 }finally{await rehearsal.close();}
}
console.log('Offline table-layer rehearsal passed: column structure, enum, quoted identifiers, generated calculations, identity parameters, bigint sequences, no row/routine/trigger copying, RLS quarantine and integrity/unsupported-shape failures. Full baseline and runtime approval remain false.');
}finally{await source.close();await destination.close();}
