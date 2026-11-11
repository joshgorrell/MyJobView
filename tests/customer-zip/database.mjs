import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite();
await db.exec(`create schema private; create table contacts(id uuid primary key,organization_id uuid,zip_code text); create table customer_locations(id uuid primary key,customer_contact_id uuid,zip_code text); create table proposals(id serial,organization_id uuid,contact_id uuid,customer_location_id uuid,jobsite_zip text,title text); create table invoices(like proposals including defaults);`);
await db.exec(readFileSync('supabase/migrations/20261111152223_require_customer_zip_for_documents.sql','utf8'));
const org='00000000-0000-0000-0000-000000000001', other='00000000-0000-0000-0000-000000000002', contact='00000000-0000-0000-0000-000000000003', location='00000000-0000-0000-0000-000000000004';
await db.query('insert into contacts values($1,$2,null)',[contact,org]);
for(const table of ['proposals','invoices']) {
 for(const zip of [null,'','   ','1234','ABCDE','123456','12345-12']) {
  await db.query('update contacts set zip_code=$1',[zip]);
  await assert.rejects(db.query(`insert into ${table}(organization_id,contact_id) values($1,$2)`,[org,contact]),/ZIP code is required/);
 }
 for(const zip of ['66610','66610-1234',' 66610 ']) {
  await db.query('update contacts set zip_code=$1',[zip]);
  await db.query(`insert into ${table}(organization_id,contact_id) values($1,$2)`,[org,contact]); // no street columns at all
 }
 await assert.rejects(db.query(`insert into ${table}(organization_id,contact_id) values($1,$2)`,[other,contact]),/document organization/);
 await db.query('update contacts set zip_code=null');
 await db.query(`insert into ${table}(organization_id,contact_id,jobsite_zip) values($1,$2,'66502')`,[org,contact]);
 await db.query(`update ${table} set title='Existing draft preserved'`);
}
await db.query('insert into customer_locations values($1,$2,$3)',[location,contact,'66502']);
await db.query('insert into proposals(organization_id,contact_id,customer_location_id) values($1,$2,$3)',[org,contact,location]);
console.log('ZIP database checks passed: missing/malformed blocked; ZIP-only, ZIP+4, selected location and destination accepted; tenant mismatch blocked; old draft edits preserved.');
await db.close();
