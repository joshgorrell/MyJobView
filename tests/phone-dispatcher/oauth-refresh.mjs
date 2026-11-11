import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync(new URL('../../supabase/functions/_shared/ringcentral-oauth.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { RingCentralOAuthClient } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
test('refresh rotates both tokens and computes expiries', async () => {
  let called = false;
  const client = new RingCentralOAuthClient('client', 'secret', { fetch: async (url, init) => {
    called = true;
    assert.equal(url, 'https://platform.ringcentral.com/restapi/oauth/token');
    assert.equal(init.method, 'POST');
    assert.equal(init.redirect, 'error');
    assert.match(init.headers.authorization, /^Basic /);
    assert.equal(init.body.get('refresh_token'), 'old-refresh');
    return new Response(JSON.stringify({
      access_token: 'new-access', refresh_token: 'new-refresh',
      expires_in: 3600, refresh_token_expires_in: 604800,
    }), { status: 200 });
  } });
  const result = await client.refresh('old-refresh', 0);
  assert.equal(called, true);
  assert.equal(result.refreshToken, 'new-refresh');
  assert.equal(result.expiresAt, '1970-01-01T01:00:00.000Z');
});
test('fails closed on invalid origin or incomplete rotation', async () => {
  assert.throws(() => new RingCentralOAuthClient('id','secret', undefined,'https://example.com'));
  const client = new RingCentralOAuthClient('id','secret', { fetch: async () =>
    new Response(JSON.stringify({ access_token: 'a', expires_in: 3600 }), { status: 200 }) });
  await assert.rejects(() => client.refresh('old'));
});
