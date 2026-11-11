import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';
globalThis.crypto ??= webcrypto;
const source = readFileSync(new URL('../../supabase/functions/_shared/ringcentral-token-crypto.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { encryptOAuthToken, decryptOAuthToken } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const key = Buffer.alloc(32, 42).toString('base64');
test('OAuth tokens are encrypted and bound to tenant/account/purpose', async () => {
  const encrypted = await encryptOAuthToken('secret-token', key, 'org-a', 'account-a', 'access');
  assert.match(encrypted, /^v1\./);
  assert.ok(!encrypted.includes('secret-token'));
  assert.equal(await decryptOAuthToken(encrypted, key, 'org-a', 'account-a', 'access'), 'secret-token');
  await assert.rejects(() => decryptOAuthToken(encrypted, key, 'org-b', 'account-a', 'access'));
  await assert.rejects(() => decryptOAuthToken(encrypted, key, 'org-a', 'account-b', 'access'));
  await assert.rejects(() => decryptOAuthToken(encrypted, key, 'org-a', 'account-a', 'refresh'));
  assert.notEqual(encrypted, await encryptOAuthToken('secret-token', key, 'org-a', 'account-a', 'access'));
});
test('invalid keys fail closed', async () => {
  await assert.rejects(() => encryptOAuthToken('token', Buffer.alloc(8).toString('base64'), 'org','account','access'));
});
