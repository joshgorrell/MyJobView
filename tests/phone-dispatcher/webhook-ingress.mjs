import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
const source = readFileSync(new URL('../../supabase/functions/_shared/ringcentral-webhook-ingress.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { validateRingCentralWebhook } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const resolver = { resolve: async (account, ext) => account === '123' && ext === '456' ? { organizationId: 'org-1' } : null };
const event = { event: '/restapi/v1.0/account/123/extension/456/message-store', body: { id: '789', type: 'VoiceMail' } };
function req(token, payload = event, challenge = null) {
  return { headers: { get: key => key === 'verification-token' ? token : key === 'validation-token' ? challenge : null }, json: async () => payload };
}
test('authenticated voicemail maps to trusted tenant', async () => {
  const result = await validateRingCentralWebhook(req('secret'), 'secret', resolver);
  assert.deepEqual(result.voicemail, { organizationId: 'org-1', accountId: '123', extensionId: '456', messageId: '789' });
});
test('unauthenticated webhook rejected', async () => {
  assert.equal((await validateRingCentralWebhook(req('wrong'), 'secret', resolver)).status, 401);
});
test('unknown mailbox rejected instead of assigning arbitrary organization', async () => {
  const payload = { ...event, event: '/restapi/v1.0/account/123/extension/999/message-store' };
  assert.equal((await validateRingCentralWebhook(req('secret', payload), 'secret', resolver)).status, 403);
});
test('SMS and other message types ignored', async () => {
  assert.equal((await validateRingCentralWebhook(req('secret', { ...event, body: { id: '789', type: 'SMS' } }), 'secret', resolver)).reason, 'ignored_event');
});
test('subscription challenge returns token without ingesting', async () => {
  const result = await validateRingCentralWebhook(req(null, event, 'challenge'), 'secret', resolver);
  assert.equal(result.validationToken, 'challenge');
  assert.equal(result.voicemail, undefined);
});
test('missing secret fails closed', async () => {
  await assert.rejects(validateRingCentralWebhook(req('secret'), '', resolver));
});
test('invalid event and invalid JSON are safely handled', async () => {
  assert.equal((await validateRingCentralWebhook(req('secret', { event: 'https://evil.example/abc', body: { id: '1', type: 'VoiceMail' } }), 'secret', resolver)).reason, 'ignored_event');
  assert.equal((await validateRingCentralWebhook({ headers: req('secret').headers, json: async () => { throw Error('invalid'); } }, 'secret', resolver)).status, 400);
});
