import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
const source = readFileSync(new URL('../../supabase/functions/_shared/ringcentral-voicemail-api.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { RingCentralVoicemailAPI } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const message = { id: 'vm-123', type: 'VoiceMail', attachments: [{ type: 'AudioRecording', uri: 'https://platform.ringcentral.com/restapi/v1.0/account/~/extension/456/message-store/vm-123/content/789' }] };
test('fetches voicemail with bearer token and no redirects', async () => {
  const calls = [];
  const api = new RingCentralVoicemailAPI('token', { fetch: async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(message), { status: 200 });
  } });
  assert.deepEqual(await api.getVoicemail('456', 'vm-123'), message);
  assert.match(calls[0].url, /extension\/456\/message-store\/vm-123$/);
  assert.equal(calls[0].init.headers.Authorization, 'Bearer token');
  assert.equal(calls[0].init.redirect, 'error');
});
test('rejects mismatched voicemail identity', async () => {
  const api = new RingCentralVoicemailAPI('token', { fetch: async () => Response.json({ ...message, id: 'other' }) });
  await assert.rejects(api.getVoicemail('456', 'vm-123'));
});
test('rejects attacker-controlled recording URL without sending token', async () => {
  let called = false;
  const api = new RingCentralVoicemailAPI('token', { fetch: async () => { called = true; throw Error('Should not call'); } });
  await assert.rejects(api.downloadRecording({ ...message, attachments: [{ type: 'AudioRecording', uri: 'https://evil.example/steal' }] }));
  assert.equal(called, false);
});
test('downloads bounded audio from approved origin', async () => {
  const api = new RingCentralVoicemailAPI('token', { fetch: async () =>
    new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/mpeg' } }) });
  assert.deepEqual([...await api.downloadRecording(message)], [1, 2, 3]);
});
test('rejects excessive or empty recordings', async () => {
  const large = new RingCentralVoicemailAPI('token', { fetch: async () =>
    new Response('x', { headers: { 'content-length': '999999999', 'content-type': 'audio/mpeg' } }) });
  await assert.rejects(large.downloadRecording(message));
  const empty = new RingCentralVoicemailAPI('token', { fetch: async () =>
    new Response(null, { headers: { 'content-type': 'audio/mpeg' } }) });
  await assert.rejects(empty.downloadRecording(message));
});
test('rejects unapproved API hosts and malformed IDs', async () => {
  assert.throws(() => new RingCentralVoicemailAPI('token', undefined, 'https://evil.example'));
  const api = new RingCentralVoicemailAPI('token', { fetch: async () => { throw Error('Should not call'); } });
  await assert.rejects(api.getVoicemail('../escape', 'vm-123'));
});
