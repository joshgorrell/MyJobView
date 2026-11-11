import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
const source = readFileSync(new URL('../../src/lib/phoneDispatcherSupabaseStore.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { SupabaseVoicemailWriteStore } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const id = { organization_id: 'org', ringcentral_account_id: 'account', ringcentral_extension_id: 'ext', ringcentral_message_id: 'message' };
function mockClient(rows, calls) {
  const query = {
    select(columns) { calls.push(['select', columns]); return this; },
    eq(column, value) { calls.push(['eq', column, value]); return this; },
    then(resolve, reject) { return Promise.resolve({ data: rows, error: null }).then(resolve, reject); },
  };
  return { from(table) { calls.push(['from', table]); return {
    upsert(row, options) { calls.push(['upsert', row, options]); return query; },
    update(row) { calls.push(['update', row]); return query; },
  }; } };
}
test('atomic claim returns inserted row and scoped conflict target', async () => {
  const calls = [];
  const store = new SupabaseVoicemailWriteStore(mockClient([{ id: '1' }], calls));
  assert.equal((await store.insert({ ...id, state: 'received' })).inserted, true);
  assert.equal(calls[1][0], 'upsert');
  assert.equal(calls[1][2].ignoreDuplicates, true);
  assert.match(calls[1][2].onConflict, /organization_id/);
});
test('duplicate claim returns false', async () => {
  const store = new SupabaseVoicemailWriteStore(mockClient([], []));
  assert.equal((await store.insert({ ...id, state: 'received' })).inserted, false);
});
test('state update includes all four identity keys and expected state', async () => {
  const calls = [];
  const store = new SupabaseVoicemailWriteStore(mockClient([{ id: '1' }], calls));
  assert.equal((await store.updateWhere(id, 'processing', { state: 'ready' })).updated, true);
  const eqs = calls.filter(c => c[0] === 'eq');
  assert.equal(eqs.length, 5);
  assert.deepEqual(eqs.at(-1), ['eq', 'state', 'processing']);
});
test('concurrent or late transition with no matching row returns false', async () => {
  const store = new SupabaseVoicemailWriteStore(mockClient([], []));
  assert.equal((await store.updateWhere(id, 'processing', { state: 'ready' })).updated, false);
});
test('missing tenant identity prevents update', async () => {
  const store = new SupabaseVoicemailWriteStore(mockClient([{ id: '1' }], []));
  await assert.rejects(store.updateWhere({ ...id, organization_id: '' }, 'processing', { state: 'ready' }));
});
test('database error does not masquerade as a duplicate', async () => {
  const bad = { from: () => ({ upsert: () => ({ select: () => Promise.resolve({ data: null, error: { code: '42501' } }) }) }) };
  const store = new SupabaseVoicemailWriteStore(bad);
  await assert.rejects(store.insert({ ...id, state: 'received' }), /claim failed/);
});
