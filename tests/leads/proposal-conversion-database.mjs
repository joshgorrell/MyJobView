import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const org = randomUUID(), otherOrg = randomUUID();
const read = path => readFile(path, 'utf8');
const extractFunction = (sql, name) => {
  const start = sql.toLowerCase().indexOf('create or replace function ' + name);
  assert.ok(start >= 0, 'Missing deployed function ' + name);
  const end = sql.indexOf('\n$$;', start);
  assert.ok(end >= 0);
  return sql.slice(start, end + 4);
};
const one = async (sql, values = []) => (await db.query(sql, values)).rows[0];
async function contact(organization = org) {
  const id = randomUUID();
  await db.query("insert into contacts(id, organization_id, contact_type, is_prospect) values($1,$2,'prospect',true)", [id, organization]);
  return id;
}
async function lead(contactId, options = {}) {
  const id = randomUUID();
  await db.query(`insert into leads(id,organization_id,contact_id,converted_from_contact_id,status,created_at,converted_at)
    values($1,$2,$3,$4,$5,$6,$7)`, [id, options.org || org, options.legacy ? null : contactId,
    options.legacy ? contactId : null, options.status || 'unclaimed', options.createdAt || '2026-01-01', options.convertedAt || null]);
  return id;
}
async function proposal(contactId, leadId = null, options = {}) {
  const id = randomUUID();
  await db.query(`insert into proposals(id,organization_id,contact_id,lead_id,is_revision,created_at)
    values($1,$2,$3,$4,$5,'2026-06-01')`, [id, options.org || org, contactId, leadId, !!options.revision]);
  return id;
}
const converted = async id => (await one('select converted_at is not null as converted from leads where id=$1', [id])).converted;

try {
  // The relevant columns and both competing production triggers are installed.
  await db.exec(`create schema private;
    create table contacts(id uuid primary key,organization_id uuid not null,contact_type text,is_prospect boolean);
    create table leads(id uuid primary key,organization_id uuid not null,contact_id uuid,converted_from_contact_id uuid,
      status text not null,created_at timestamptz not null,converted_at timestamptz,updated_at timestamptz);
    create table proposals(id uuid primary key,organization_id uuid not null,contact_id uuid,lead_id uuid,
      is_revision boolean not null default false,created_at timestamptz not null);
    create table lead_conversions(id uuid default gen_random_uuid(),organization_id uuid not null,lead_id uuid unique,
      contact_id uuid,conversion_type text,source_id uuid,converted_at timestamptz);
    create function public.sync_is_prospect_flag() returns trigger language plpgsql as $$
      begin new.is_prospect := new.contact_type='prospect'; return new; end; $$;
    create trigger sync_is_prospect_flag_trigger before insert or update of contact_type on contacts
      for each row execute function public.sync_is_prospect_flag();`);
  const legacy = await read('supabase/migrations/20261110190000_lead_three_path_conversion.sql');
  await db.exec(extractFunction(legacy, 'private.convert_matching_leads'));
  await db.exec(extractFunction(legacy, 'private.convert_lead_on_proposal'));
  await db.exec(extractFunction(await read('supabase/migrations/20261111000001_convert_contact_proposals_to_leads.sql'), 'public.mark_lead_converted_on_proposal'));
  await db.exec(`create trigger trg_convert_lead_on_proposal after insert or update of contact_id on proposals
    for each row execute function private.convert_lead_on_proposal();
    create trigger trg_mark_lead_converted_on_proposal after insert or update of lead_id on proposals
    for each row execute function public.mark_lead_converted_on_proposal();`);
  await db.exec(await read('supabase/migrations/20261111193000_promote_prospect_on_lead_insert.sql'));
  if (!process.argv.includes('--baseline')) {
    const migration = await read('supabase/migrations/20261111193415_preserve_independent_pipeline_leads.sql');
    await db.exec(migration);
    await db.exec(migration); // Deployment retries must remain safe.
  }

  let c = await contact(), a = await lead(c), b = await lead(c);
  assert.deepEqual(await one('select contact_type,is_prospect from contacts where id=$1', [c]), { contact_type: 'lead', is_prospect: false });
  let p = await proposal(c, a);
  assert.equal(await converted(a), true);
  assert.equal(await converted(b), false, 'A proposal must preserve unrelated opportunities for the same customer');
  assert.equal((await one('select source_id from lead_conversions where lead_id=$1', [a])).source_id, p);
  await db.query('update proposals set contact_id=contact_id,lead_id=lead_id where id=$1', [p]);
  assert.equal((await one('select count(*)::int as count from lead_conversions where lead_id=$1', [a])).count, 1);
  assert.equal(await converted(b), false, 'Repeated updates must not convert a sibling Lead');

  c = await contact(); a = await lead(c); p = await proposal(c);
  assert.equal(await converted(a), true);
  assert.equal((await one('select lead_id from proposals where id=$1', [p])).lead_id, a, 'Contact-created proposals retain inferred attribution');
  assert.equal((await one('select source_id from lead_conversions where lead_id=$1', [a])).source_id, p);

  c = await contact(); a = await lead(c); b = await lead(c); p = await proposal(c);
  assert.equal(await converted(a), false, 'Ambiguous automatic matching must leave both opportunities open');
  assert.equal(await converted(b), false);
  assert.equal((await one('select lead_id from proposals where id=$1', [p])).lead_id, null);
  await db.query('update proposals set lead_id=$1 where id=$2', [b, p]);
  assert.equal(await converted(b), true, 'An explicit link added later must convert its Lead');
  assert.equal(await converted(a), false);

  for (const status of ['closed_won', 'closed_lost']) {
    c = await contact(); a = await lead(c, { status }); b = await lead(c); p = await proposal(c);
    assert.equal(await converted(a), false, 'Closed opportunities are not new conversions');
    assert.equal(await converted(b), true, 'Closed Leads must not make the active match ambiguous');
    assert.equal((await one('select lead_id from proposals where id=$1', [p])).lead_id, b);
  }
  c = await contact(); a = await lead(c, { createdAt: '2026-07-01' }); await proposal(c, a);
  assert.equal(await converted(a), false, 'An older proposal must not convert a later opportunity');
  c = await contact(); a = await lead(c); await proposal(c, a, { revision: true });
  assert.equal(await converted(a), false, 'A proposal revision is not a new sales conversion');

  c = await contact(); a = await lead(c); const otherContact = await contact();
  await proposal(otherContact, a);
  assert.equal(await converted(a), false, 'Explicit IDs must belong to the same Contact');
  await proposal(c, a, { org: otherOrg });
  assert.equal(await converted(a), false, 'Explicit IDs must belong to the same organization');
  b = await lead(c, { org: otherOrg }); await proposal(c, b, { org: otherOrg });
  assert.equal(await converted(b), false, 'A mismatched Contact organization must prevent conversion');
  c = await contact(); a = await lead(c, { legacy: true }); p = await proposal(c);
  assert.equal(await converted(a), true, 'Legacy Contact links remain supported');
  assert.equal((await one('select lead_id from proposals where id=$1', [p])).lead_id, a);

  c = await contact(); a = await lead(c, { convertedAt: '2026-02-01' }); await proposal(c, a);
  assert.equal((await one('select count(*)::int as count from lead_conversions where lead_id=$1', [a])).count, 0,
    'Existing conversion history must not be invented or reassigned');
  assert.equal((await one("select count(*)::int as count from pg_trigger where tgrelid='proposals'::regclass and not tgisinternal")).count, 1,
    'A single trigger owns proposal conversion');
  console.log('Pipeline database checks passed: promotion, explicit and inferred attribution, ambiguity, repeated updates, closed/future/revision exclusions, and organization isolation.');
} finally {
  await db.close();
}
