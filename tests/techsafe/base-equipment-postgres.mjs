import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

// Real PostgreSQL engine (PGlite), not a source-text assertion. Isolated,
// disposable schema: no production credentials, migration or network access.
const db=new PGlite();
const a='11111111-1111-4111-8111-111111111111';
const b='22222222-2222-4222-8222-222222222222';
const org='33333333-3333-4333-8333-333333333333';
const otherOrg='44444444-4444-4444-8444-444444444444';
const proposal='55555555-5555-4555-8555-555555555555';
const otherProposal='66666666-6666-4666-8666-666666666666';
try {
 await db.exec(`CREATE SCHEMA techsafe_source;
 CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
 CREATE TABLE techsafe_source.integration_connections(
 connection_id uuid PRIMARY KEY,sales_order_id uuid NOT NULL,organization_id uuid NOT NULL,proposal_id uuid NOT NULL);
 CREATE TABLE techsafe_source.order_revision_ledger(
 connection_id uuid PRIMARY KEY,sales_order_id uuid NOT NULL,organization_id uuid NOT NULL,
 proposal_id uuid NOT NULL,revision bigint NOT NULL,state text NOT NULL,
 hold_reason text,source_fingerprint text,updated_at timestamptz);
 CREATE TABLE public.proposal_line_items(id uuid PRIMARY KEY,proposal_id uuid,organization_id uuid,quantity int);`);
 const migration=readFileSync(new URL('../../supabase/migrations/20261108233000_techsafe_base_equipment_revision_invalidation.sql',import.meta.url),'utf8');
 await db.exec(migration);
 await db.query(`INSERT INTO techsafe_source.integration_connections VALUES($1,$2,$3,$4),($5,$6,$7,$8)`,
 [a,a,org,proposal,b,b,otherOrg,otherProposal]);
 await db.query(`INSERT INTO techsafe_source.order_revision_ledger
 (connection_id,sales_order_id,organization_id,proposal_id,revision,state,source_fingerprint)
 VALUES($1,$2,$3,$4,4,'candidate',repeat('a',64)),
 ($5,$6,$7,$8,9,'candidate',repeat('b',64))`,
 [a,a,org,proposal,b,b,otherOrg,otherProposal]);
 const read=async()=> (await db.query('SELECT connection_id,revision,state,hold_reason,source_fingerprint FROM techsafe_source.order_revision_ledger ORDER BY connection_id')).rows;
 const initial=await read();
 assert.equal(initial[0].revision,4);
 // INSERT on an approved Sales Order's underlying proposal invalidates its ledger.
 await db.query('INSERT INTO public.proposal_line_items VALUES($1,$2,$3,1)',[a,proposal,org]);
 let rows=await read();
 assert.equal(rows[0].revision,5);
 assert.equal(rows[0].state,'held');
 assert.equal(rows[0].source_fingerprint,'0'.repeat(64));
 assert.equal(rows[1].revision,9,'unrelated tenant must remain untouched');
 // Reset the candidate to exercise UPDATE and cross-tenant reparenting.
 await db.query("UPDATE techsafe_source.order_revision_ledger SET state='candidate',source_fingerprint=repeat('a',64) WHERE connection_id=$1",[a]);
 await db.query('UPDATE public.proposal_line_items SET quantity=2 WHERE id=$1',[a]);
 rows=await read(); assert.equal(rows[0].revision,6);assert.equal(rows[0].state,'held');
 // Moving a source line must invalidate both the old and new Sales Order scopes.
 await db.query('UPDATE public.proposal_line_items SET proposal_id=$1,organization_id=$2 WHERE id=$3',[otherProposal,otherOrg,a]);
 rows=await read();
 assert.equal(rows[0].revision,7);
 assert.equal(rows[1].revision,10);
 assert.equal(rows[1].state,'held');
 // DELETE invalidates the new owner, not the former owner.
 await db.query('DELETE FROM public.proposal_line_items WHERE id=$1',[a]);
 rows=await read();
 assert.equal(rows[0].revision,7);
 assert.equal(rows[1].revision,11);
 // An unlinked proposal has no Techsafe ledger to invalidate.
 await db.query('INSERT INTO public.proposal_line_items VALUES($1,$2,$3,1)',[b,otherProposal,org]);
 rows=await read(); assert.equal(rows[0].revision,7);assert.equal(rows[1].revision,11);
 // A failed source transaction must roll back its ledger invalidation too.
 const beforeRollback=await read();
 await db.exec('BEGIN');
 await db.query('UPDATE public.proposal_line_items SET quantity=3 WHERE id=$1',[b]);
 // The unlinked row must not affect either connected Sales Order.
 assert.deepEqual(await read(),beforeRollback);
 await db.query('UPDATE public.proposal_line_items SET organization_id=$1 WHERE id=$2',[otherOrg,b]);
 // Still unlinked: source identity requires BOTH proposal and organization.
 assert.deepEqual(await read(),beforeRollback);
 await db.exec('ROLLBACK');
 assert.deepEqual(await read(),beforeRollback);
 // Verify transactional rollback of an actual connected source mutation.
 await db.query('INSERT INTO public.proposal_line_items VALUES($1,$2,$3,1)',[a,proposal,org]);
 const committed=await read();
 await db.exec('BEGIN');
 await db.query('UPDATE public.proposal_line_items SET quantity=4 WHERE id=$1',[a]);
 let inside=await read();
 assert.equal(inside[0].revision,committed[0].revision+1);
 assert.equal(inside[0].state,'held');
 await db.exec('ROLLBACK');
 assert.deepEqual(await read(),committed,'rollback must restore revision and fingerprint');
 const qty=(await db.query('SELECT quantity FROM public.proposal_line_items WHERE id=$1',[a])).rows[0].quantity;
 assert.equal(qty,1,'rollback must restore source equipment');
 // Reaching bigint revision limit must never wrap to a reusable revision.
 await db.query("UPDATE techsafe_source.order_revision_ledger SET revision=9223372036854775807,state='candidate',source_fingerprint=repeat('c',64) WHERE connection_id=$1",[a]);
 await db.query('UPDATE public.proposal_line_items SET quantity=5 WHERE id=$1',[a]);
 inside=await read();
 assert.equal(String(inside[0].revision),'9223372036854775807');
 assert.equal(inside[0].state,'held');
 assert.equal(inside[0].hold_reason,'revision_exhausted');
 assert.equal(inside[0].source_fingerprint,'0'.repeat(64));
 assert.equal(inside[1].revision,11,'unrelated tenant remains untouched');
 console.log('Techsafe base-equipment PostgreSQL trigger runtime: PASS');
} finally {await db.close();}
