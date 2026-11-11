import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../../supabase/functions/_shared/voicemail-transcription-api.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { VoicemailTranscriptionAPI } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

test('posts voicemail audio as multipart form and reads transcript', async () => {
  const calls = [];
  const api = new VoicemailTranscriptionAPI('secret', { fetch: async (url, init) => {
    calls.push({ url, init });
    return Response.json({ text: ' Please call me back. ' });
  } });
  assert.deepEqual(await api.transcribe(new Uint8Array([1, 2, 3]), 'audio/mpeg'), { text: 'Please call me back.' });
  assert.equal(calls[0].url, 'https://api.openai.com/v1/audio/transcriptions');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer secret');
  assert.equal(calls[0].init.redirect, 'error');
  assert.equal(calls[0].init.body.get('model'), 'gpt-4o-mini-transcribe');
  assert.equal(calls[0].init.body.get('file').name, 'voicemail.mp3');
});
test('rejects empty or excessive audio without provider call', async () => {
  let called = false;
  const api = new VoicemailTranscriptionAPI('secret', { fetch: async () => { called = true; throw Error('unexpected'); } });
  await assert.rejects(api.transcribe(new Uint8Array(), 'audio/mpeg'));
  await assert.rejects(api.transcribe(new Uint8Array(25 * 1024 * 1024 + 1), 'audio/mpeg'));
  assert.equal(called, false);
});
test('rejects unapproved audio formats', async () => {
  const api = new VoicemailTranscriptionAPI('secret');
  await assert.rejects(api.transcribe(new Uint8Array([1]), 'text/html'));
});
test('rejects empty transcript from provider', async () => {
  const api = new VoicemailTranscriptionAPI('secret', { fetch: async () => Response.json({ text: '  ' }) });
  await assert.rejects(api.transcribe(new Uint8Array([1]), 'audio/wav'));
});
test('provider error is propagated without exposing API key', async () => {
  const api = new VoicemailTranscriptionAPI('secret', { fetch: async () => new Response('secret provider error', { status: 429 }) });
  await assert.rejects(api.transcribe(new Uint8Array([1]), 'audio/wav'), /HTTP 429/);
});
test('requires secret and supported model', () => {
  assert.throws(() => new VoicemailTranscriptionAPI(''));
  assert.throws(() => new VoicemailTranscriptionAPI('secret', undefined, 'unknown'));
});
