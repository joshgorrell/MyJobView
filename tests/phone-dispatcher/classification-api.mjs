import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
const source = readFileSync(new URL('../../supabase/functions/_shared/voicemail-classification-api.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { VoicemailClassificationAPI } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const valid = { summary: 'Alarm panel reports trouble.', department: 'security', departmentConfidence: 0.99, spamConfidence: 0.01, urgent: true, callbackRequested: true };
const respond = value => ({ fetch: async () => Response.json({ choices: [{ message: { content: JSON.stringify(value) } }] }) });
test('classifies voicemail from transcript and returns validated fields', async () => {
  const api = new VoicemailClassificationAPI('secret', respond(valid));
  assert.deepEqual(await api.classify('My alarm panel says trouble'), valid);
});
test('request never contains caller phone or account identity', async () => {
  let request;
  const api = new VoicemailClassificationAPI('secret', { fetch: async (_url, init) => {
    request = JSON.parse(init.body);
    return Response.json({ choices: [{ message: { content: JSON.stringify(valid) } }] });
  } });
  await api.classify('My alarm is sounding');
  assert.equal(request.messages[1].content, 'My alarm is sounding');
  assert.match(request.messages[0].content, /untrusted data/);
});
test('invalid confidence produces null, leading to review by policy', async () => {
  const api = new VoicemailClassificationAPI('secret', respond({ ...valid, departmentConfidence: 9, spamConfidence: -1 }));
  const result = await api.classify('Alarm');
  assert.equal(result.departmentConfidence, null);
  assert.equal(result.spamConfidence, null);
});
test('unrecognized department becomes null instead of arbitrary route', async () => {
  const api = new VoicemailClassificationAPI('secret', respond({ ...valid, department: 'other' }));
  assert.equal((await api.classify('Message')).department, null);
});
test('missing fields and malformed JSON fail closed', async () => {
  const api = new VoicemailClassificationAPI('secret', respond({ summary: 'hello' }));
  await assert.rejects(api.classify('Message'));
  const malformed = new VoicemailClassificationAPI('secret', { fetch: async () => Response.json({ choices: [{ message: { content: 'nope' } }] }) });
  await assert.rejects(malformed.classify('Message'));
});
test('provider failure is reported without exposing token', async () => {
  const api = new VoicemailClassificationAPI('secret', { fetch: async () => new Response('secret', { status: 429 }) });
  await assert.rejects(api.classify('Message'), /HTTP 429/);
});
