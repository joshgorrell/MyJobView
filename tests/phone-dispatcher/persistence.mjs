import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
const source = readFileSync(new URL('../../src/lib/phoneDispatcherPersistence.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { DurableVoicemailRepository } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const id = { organizationId: 'org1', accountId: 'account1', extensionId: 'ext1', messageId: 'msg1' };
test('claim writes full tenant-scoped dedupe identity', async () => {
  let row;
  const repo = new DurableVoicemailRepository({ insert: async r => { row = r; return { inserted: true }; }, updateWhere: async () => ({ updated: true }) });
  assert.equal(await repo.claim(id), true);
  assert.deepEqual(row, { organization_id: 'org1', ringcentral_account_id: 'account1', ringcentral_extension_id: 'ext1', ringcentral_message_id: 'msg1', state: 'received' });
});
test('duplicate claim is not processed twice', async () => {
  const repo = new DurableVoicemailRepository({ insert: async () => ({ inserted: false }), updateWhere: async () => ({ updated: false }) });
  assert.equal(await repo.claim(id), false);
});
test('transition requires expected state and maps fields', async () => {
  let call;
  const repo = new DurableVoicemailRepository({ insert: async () => ({ inserted: true }), updateWhere: async (...args) => { call = args; return { updated: true }; } });
  assert.equal(await repo.transition(id, 'processing', { state: 'ready', summary: 'Call back', urgent: true }), true);
  assert.equal(call[1], 'processing');
  assert.deepEqual(call[2], { state: 'ready', summary: 'Call back', urgent: true });
  assert.equal(call[0].organization_id, 'org1');
});
test('invalid transition fails without database mutation', async () => {
  let called = false;
  const repo = new DurableVoicemailRepository({ insert: async () => ({ inserted: true }), updateWhere: async () => { called = true; return { updated: true }; } });
  await assert.rejects(repo.transition(id, 'ready', { state: 'processing' }));
  assert.equal(called, false);
});
test('quarantine must have expiry and confidence must be valid', async () => {
  const repo = new DurableVoicemailRepository({ insert: async () => ({ inserted: true }), updateWhere: async () => ({ updated: true }) });
  await assert.rejects(repo.transition(id, 'processing', { state: 'quarantined' }));
  await assert.rejects(repo.transition(id, 'processing', { state: 'ready', spamConfidence: 1.5 }));
});
test('incomplete identity fails closed', async () => {
  const repo = new DurableVoicemailRepository({ insert: async () => ({ inserted: true }), updateWhere: async () => ({ updated: true }) });
  await assert.rejects(repo.claim({ ...id, organizationId: '' }));
});
