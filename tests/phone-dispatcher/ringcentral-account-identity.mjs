import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync(new URL('../../supabase/functions/_shared/ringcentral-account-identity.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { verifyRingCentralIdentity } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
test('RingCentral identity is derived from authenticated provider API', async () => {
  const identity = await verifyRingCentralIdentity('token', async (url, init) => {
    assert.equal(url, 'https://platform.ringcentral.com/restapi/v1.0/account/~/extension/~');
    assert.equal(init.headers.authorization, 'Bearer token');
    assert.equal(init.redirect, 'error');
    return new Response(JSON.stringify({ id: 200, account: { id: 100 } }), { status: 200 });
  });
  assert.deepEqual(identity, { accountId: '100', extensionId: '200' });
});
test('invalid provider identity fails closed', async () => {
  await assert.rejects(() => verifyRingCentralIdentity('token', async () =>
    new Response(JSON.stringify({ id: 200 }), { status: 200 })));
  await assert.rejects(() => verifyRingCentralIdentity('token', async () =>
    new Response(JSON.stringify({ id: 200, account: { id: 100 } }), { status: 401 })));
  await assert.rejects(() => verifyRingCentralIdentity('token', undefined, 'https://attacker.example'));
});
