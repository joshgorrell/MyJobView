import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';
globalThis.crypto ??= webcrypto;
const source = readFileSync(new URL('../../supabase/functions/_shared/ringcentral-oauth-code-flow.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const stub = 'data:text/javascript;base64,' + Buffer.from('export async function encryptOAuthToken() { return "encrypted"; }').toString('base64');
const { createRingCentralOAuthState, ringCentralAuthorizeUrl, exchangeRingCentralCode } =
  await import('data:text/javascript;base64,' + Buffer.from(js.replace("from './ringcentral-token-crypto.ts'", "from '" + stub + "'")).toString('base64'));
test('authorization uses random state and fixed provider origin', () => {
  const state = createRingCentralOAuthState();
  assert.notEqual(state, createRingCentralOAuthState());
  const url = new URL(ringCentralAuthorizeUrl({
    origin: 'https://platform.ringcentral.com', clientId: 'client',
    redirectUri: 'https://example.org/callback', state,
  }));
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('state'), state);
  assert.throws(() => ringCentralAuthorizeUrl({
    origin: 'https://evil.example', clientId: 'client',
    redirectUri: 'https://example.org/callback', state,
  }));
});
test('authorization code exchange validates rotated token response', async () => {
  const input = { origin: 'https://platform.ringcentral.com', clientId: 'id',
    clientSecret: 'secret', redirectUri: 'https://example.org/callback', code: 'one-time-code',
    now: 0, transport: async (_url, init) => {
      assert.equal(init.method, 'POST');
      assert.equal(init.body.get('grant_type'), 'authorization_code');
      return new Response(JSON.stringify({ access_token: 'access', refresh_token: 'refresh',
        expires_in: 3600 }), { status: 200 });
    },
  };
  const result = await exchangeRingCentralCode(input);
  assert.equal(result.expiresAt, '1970-01-01T01:00:00.000Z');
  assert.equal(result.refreshToken, 'refresh');
  await assert.rejects(() => exchangeRingCentralCode({
    ...input, transport: async () => new Response(JSON.stringify({ access_token: 'only' }), { status: 200 }),
  }));
});
