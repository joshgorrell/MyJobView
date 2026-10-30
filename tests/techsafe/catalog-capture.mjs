import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {applicationObservationDb} from './fixtures/application-observation-db.mjs';
import {captureKinds,captureQuery,captureCountQuery,captureFingerprintQuery,catalogStampQuery,summarizeCapture,finalizeCapture} from '../../scripts/techsafe/catalog-capture.mjs';
const {db}=await applicationObservationDb();
const hash=text=>createHash('sha256').update(text,'utf8').digest('hex');
try{
await db.exec(`CREATE TABLE public.capture_test_records(secret text);INSERT INTO public.capture_test_records VALUES('PRIVATE_ROW_MUST_NOT_BE_CAPTURED');
CREATE SCHEMA vault;CREATE TABLE vault.capture_test_secrets(secret text);INSERT INTO vault.capture_test_secrets VALUES('VAULT_VALUE_MUST_NOT_BE_CAPTURED');
CREATE TYPE public.capture_test_enum AS ENUM('one','two');
CREATE SEQUENCE public.capture_test_sequence AS bigint START 9007199254740993 MAXVALUE 9223372036854775807;
CREATE FUNCTION public.capture_must_not_execute() RETURNS void LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'Application routine invoked';END$$;
CREATE FUNCTION public.capture_literal_escape() RETURNS text LANGUAGE sql AS $$SELECT E'\\\\n'$$;`);
for(const file of ['catalog-capture-metadata.sql','catalog-capture-dependencies.sql']){
 const query=fs.readFileSync('scripts/techsafe/'+file,'utf8');
 assert.doesNotMatch(query.replace(/--[^\n]*/g,'').replace(/'(?:''|[^'])*'/g,''),/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|CALL|DO)\b/i);
 const result=(await db.query(query)).rows[0].metadata;
 const text=JSON.stringify(result);assert.equal(text.includes('PRIVATE_ROW_MUST_NOT_BE_CAPTURED'),false);assert.equal(text.includes('VAULT_VALUE_MUST_NOT_BE_CAPTURED'),false);
}
const stamp=async()=>(await db.query(catalogStampQuery)).rows[0].catalog_stamp;
const beforeStamp=await stamp();const pages=[],expectedCounts={},fingerprints={};
for(const kind of captureKinds){
 const query=captureQuery(kind,0,2);assert.match(query,/^WITH /);
 assert.doesNotMatch(query.replace(/'(?:''|[^'])*'/g,''),/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|CALL|DO)\b/i);
 expectedCounts[kind]=(await db.query(captureCountQuery(kind))).rows[0].count;
 for(let offset=0;offset<expectedCounts[kind];offset+=2)pages.push({kind,offset,rows:(await db.query(captureQuery(kind,offset,2))).rows});
 fingerprints[kind]=(await db.query(captureFingerprintQuery(kind))).rows;
}
const afterStamp=await stamp();assert.equal(beforeStamp,afterStamp);
const checks={beforeStamp,afterStamp,expectedCounts,fingerprints};
const result=finalizeCapture(pages,checks);assert.equal(result.catalogPagesComplete,true);assert.equal(result.liveFingerprintsMatch,true);assert.equal(result.nativePgDump,false);assert.equal(result.restoreApproved,false);assert.equal(result.quoteReady,false);
assert.equal(result.objects.length,Object.values(expectedCounts).reduce((a,b)=>a+b,0));
assert.ok(result.objects.some(x=>x.identity==='public.capture_must_not_execute()'));
const serialized=JSON.stringify(pages);assert.equal(serialized.includes('PRIVATE_ROW_MUST_NOT_BE_CAPTURED'),false);assert.equal(serialized.includes('VAULT_VALUE_MUST_NOT_BE_CAPTURED'),false);
assert.equal(result.objects.some(x=>x.identity==='vault.capture_test_secrets'),false);
const sequence=pages.flatMap(p=>p.rows).find(r=>r.identity==='public.capture_test_sequence');
const payload=JSON.parse(sequence.payload_text);assert.equal(payload.sequence.start,'9007199254740993');assert.equal(payload.sequence.maximum,'9223372036854775807');assert.equal(hash(sequence.payload_text),sequence.content_hash);
const literal=pages.flatMap(p=>p.rows).find(r=>r.identity==='public.capture_literal_escape()');
const native=(await db.query("SELECT pg_get_functiondef('public.capture_literal_escape()'::regprocedure) AS definition")).rows[0].definition;
assert.equal(JSON.parse(JSON.parse(JSON.stringify(literal)).payload_text).definition,native,'JSON transport must preserve SQL newlines and literal backslashes exactly');
const clone=()=>structuredClone(pages);
const tampered=clone();tampered[0].rows[0].payload_text+=' ';assert.throws(()=>finalizeCapture(tampered,checks),/hash mismatch/);
const rehashed=clone();rehashed[0].rows[0].payload_text+=' ';rehashed[0].rows[0].content_hash=hash(rehashed[0].rows[0].payload_text);assert.throws(()=>finalizeCapture(rehashed,checks),/fingerprint mismatch/);
assert.throws(()=>finalizeCapture(pages.slice(1),checks),/count mismatch/);
assert.throws(()=>summarizeCapture([...pages,pages[0]]),/Duplicate/);
assert.throws(()=>finalizeCapture(pages,{...checks,afterStamp:'0'.repeat(64)}),/Catalog changed/);
assert.throws(()=>finalizeCapture(pages,{...checks,fingerprints:{}}),/Missing live fingerprints/);
for(const args of [['invalid'],['relations',-1],['relations',0,0],['relations',0,26],['relations',1.5],['relations',Infinity]])assert.throws(()=>captureQuery(...args));
await db.exec('CREATE TABLE public.capture_schema_changed(id integer)');assert.notEqual(await stamp(),beforeStamp);
assert.equal((await db.query('SELECT count(*)::int AS n FROM public.capture_test_records')).rows[0].n,1);
console.log('Catalog capture passed: catalog-only pagination, no application/vault rows or routine execution, exact SQL/backslash transport, bigint preservation, native payload hashes/live fingerprint checks, missing/duplicate/tampered capture rejection and DDL drift detection. Restore and quote approval remain false.');
}finally{await db.close();}
