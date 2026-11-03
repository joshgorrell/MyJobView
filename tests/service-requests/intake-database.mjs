import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();await db.exec(`create table service_requests(id text, requested_date timestamptz); insert into service_requests values('legacy',null);`);
await db.exec(await readFile('supabase/migrations/20261006141909_service_request_fast_intake.sql','utf8'));
assert.equal((await db.query('select customer_contact_instruction from service_requests')).rows[0].customer_contact_instruction,'dispatch');
await assert.rejects(db.exec("insert into service_requests(id,earliest_date,requested_date) values('bad','2026-10-09','2026-10-08')"));await db.close();
console.log('Intake schema defaults and invalid scheduling-window checks passed.');
