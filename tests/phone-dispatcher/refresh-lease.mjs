import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';
globalThis.crypto ??= { randomUUID };
const source = readFileSync(new URL('../../supabase/functions/_shared/ringcentral-token-provider.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  .replace(/import .* from '\.\/ringcentral-oauth\.ts';\n/g, '')
  .replace(/import \{ encryptOAuthToken, decryptOAuthToken \} from '\.\/ringcentral-token-crypto\.ts';/, `
const encryptOAuthToken = async token => 'encrypted:' + token;
const decryptOAuthToken = async token => token.replace(/^encrypted:/, '');
`);
const { getRingCentralAccessToken } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
test('only one concurrent worker may refresh a single-use token', async () => {
  let row = {
    organization_id: 'org', ringcentral_account_id: '123',
    encrypted_access_token: 'encrypted:old-access',
    encrypted_refresh_token: 'encrypted:old-refresh',
    access_expires_at: '2020-01-01T00:00:00.000Z',
    refresh_expires_at: null, token_version: 1, status: 'connected',
  };
  let lease = null;
  const store = {
    read: async () => ({ ...row }),
    acquireRefreshLease: async (_row, id) => {
      if (lease) return false;
      lease = id; return true;
    },
    rotate: async (_row, next, id) => {
      if (lease !== id) return false;
      row = { ...row, ...next }; lease = null; return true;
    },
    releaseRefreshLease: async (_row, id) => { if (lease === id) lease = null; },
  };
  let refreshes = 0;
  const oauth = { refresh: async () => {
    refreshes++;
    await new Promise(resolve => setTimeout(resolve, 15));
    return { accessToken: 'new-access', refreshToken: 'new-refresh',
      expiresAt: '2099-01-01T00:00:00.000Z', refreshExpiresAt: null };
  }};
  const results = await Promise.allSettled([
    getRingCentralAccessToken(store, oauth, 'key', 'org', '123'),
    getRingCentralAccessToken(store, oauth, 'key', 'org', '123'),
  ]);
  assert.equal(refreshes, 1);
  assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(results.filter(x => x.status === 'rejected').length, 1);
  assert.equal(row.token_version, 2);
  assert.equal(lease, null);
});
