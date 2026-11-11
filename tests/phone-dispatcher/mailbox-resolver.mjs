import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
const source = readFileSync(new URL('../../supabase/functions/_shared/ringcentral-mailbox-resolver.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { RingCentralMailboxResolver } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
function client(result, calls) {
  const query = { eq(k, v) { calls.push([k, v]); return this; }, async maybeSingle() { return result; } };
  return { from(table) { calls.push(['table', table]); return { select(column) { calls.push(['select', column]); return query; } }; } };
}
test('enabled account and extension resolve to stored organization', async () => {
  const calls = [];
  const resolver = new RingCentralMailboxResolver(client({ data: { organization_id: 'org-1' }, error: null }, calls));
  assert.deepEqual(await resolver.resolve('123', '456'), { organizationId: 'org-1' });
  assert.deepEqual(calls.slice(-3), [['ringcentral_account_id', '123'], ['ringcentral_extension_id', '456'], ['enabled', true]]);
});
test('unknown mailbox returns null without fallback', async () => {
  const resolver = new RingCentralMailboxResolver(client({ data: null, error: null }, []));
  assert.equal(await resolver.resolve('123', '456'), null);
});
test('invalid mailbox identity rejected before querying', async () => {
  const calls = [];
  const resolver = new RingCentralMailboxResolver(client({ data: null, error: null }, calls));
  assert.equal(await resolver.resolve('../escape', '456'), null);
  assert.deepEqual(calls, []);
});
test('database error fails closed', async () => {
  const resolver = new RingCentralMailboxResolver(client({ data: null, error: { code: '42501' } }, []));
  await assert.rejects(resolver.resolve('123', '456'), /lookup failed/);
});
