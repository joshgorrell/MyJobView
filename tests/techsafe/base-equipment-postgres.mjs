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
 console.log('Techsafe base-equipment PostgreSQL trigger runtime: PASS');
} finally {await db.close();}
