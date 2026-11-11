import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';
globalThis.crypto ??= webcrypto;
const source = readFileSync(new URL('../../supabase/functions/_shared/ringcentral-oauth-state.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { hashRingCentralOAuthState, registerRingCentralState, consumeRingCentralState } =
  await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
test('state is hashed, expiring and single-use', async () => {
  const state = 'a'.repeat(43);
  const hash = await hashRingCentralOAuthState(state);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.notEqual(hash, state);
  let pending;
  const store = {
    create: async row => { pending = row; },
    consume: async requested => {
      if (pending?.state_hash !== requested) return null;
      const row = pending;
      pending = null;
      return row;
    },
  };
  const details = { organization_id: 'org', initiated_by: 'admin', redirect_uri: 'https://example.com/callback' };
  await registerRingCentralState(store, state, details, 0);
  assert.equal(pending.expires_at, '1970-01-01T00:10:00.000Z');
  assert.deepEqual(await consumeRingCentralState(store, state), { ...details, state_hash: hash, expires_at: pending?.expires_at ?? '1970-01-01T00:10:00.000Z' });
  await assert.rejects(() => consumeRingCentralState(store, state));
  await assert.rejects(() => hashRingCentralOAuthState('short'));
});
