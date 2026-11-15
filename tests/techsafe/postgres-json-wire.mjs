import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {techsafePostgresJsonTypes} from '../../supabase/functions/_shared/techsafe-postgres-json.mjs';

const {default:postgres}=await import(process.env.TECHSAFE_POSTGRES_MODULE??'postgres');
const url=process.env.TECHSAFE_POSTGRES_JSON_TEST_DATABASE_URL;
const legacy=postgres({max:1});
const fixed=postgres({max:1,types:techsafePostgresJsonTypes});
const db=new PGlite();
try{
 await db.exec(`CREATE TABLE certificates(snapshot jsonb CHECK(jsonb_typeof(snapshot)='object' AND snapshot->>'schemaVersion'='2'))`);
 const snapshot={schemaVersion:2,lines:[{description:'Receiver — café',quantity:1}],complete:true};
 const text=JSON.stringify(snapshot);
 // Use the actual pinned deployment driver's resolved serializers, not mocks.
 const oldWire=legacy.options.serializers[3802](text);
 assert.equal(typeof JSON.parse(oldWire),'string');
 await assert.rejects(db.query('INSERT INTO certificates VALUES($1::jsonb)',[oldWire]),e=>e.code==='23514');
 for(const oid of [114,3802]){
  const wire=fixed.options.serializers[oid](text);
  assert.deepEqual(JSON.parse(wire),snapshot);
  assert.deepEqual(fixed.options.parsers[oid](wire),snapshot);
  assert.deepEqual(JSON.parse(fixed.options.serializers[oid](snapshot)),snapshot);
  for(const scalar of ['null','false','42','"literal"','[]'])assert.equal(fixed.options.serializers[oid](scalar),scalar);
 }
 await db.query('INSERT INTO certificates VALUES($1::jsonb)',[fixed.options.serializers[3802](text)]);
 assert.deepEqual((await db.query('SELECT snapshot FROM certificates')).rows[0].snapshot,snapshot);
 await assert.rejects(db.query('INSERT INTO certificates VALUES($1::jsonb)',[fixed.options.serializers[3802]('malformed')]),e=>e.code==='22P02');
 if(url){
  const oldSql=postgres(url,{max:1,prepare:false});
  const sql=postgres(url,{max:1,prepare:false,types:techsafePostgresJsonTypes});
  try{
   assert.equal((await oldSql.unsafe('SELECT jsonb_typeof($1::jsonb) AS kind',[text]))[0].kind,'string');
   assert.equal((await sql.unsafe('SELECT jsonb_typeof($1::jsonb) AS kind',[text]))[0].kind,'object');
   await sql.begin(async tx=>{
    await tx.unsafe(`CREATE TEMP TABLE json_wire_regression(snapshot jsonb CHECK(jsonb_typeof(snapshot)='object' AND snapshot->>'schemaVersion'='2')) ON COMMIT DROP`);
    await tx.unsafe('INSERT INTO json_wire_regression VALUES($1::jsonb)',[text]);
    assert.deepEqual((await tx.unsafe('SELECT snapshot FROM json_wire_regression'))[0].snapshot,snapshot);
   });
  }finally{await oldSql.end();await sql.end();}
 }
 console.log('PASS: actual postgres.js JSON/JSONB codecs reproduce double encoding, preserve serialized documents, reject malformed JSON and round-trip certificate objects'+(url?' over PostgreSQL wire':''));
}finally{await db.close();await legacy.end();await fixed.end();}
