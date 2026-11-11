import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
const source = readFileSync(new URL('../../supabase/functions/_shared/phone-voicemail-retry.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { nextVoicemailRetry, voicemailAudioType, voicemailAudioExtension } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
test('exponential retry intervals and exhaustion', () => {
  assert.equal(nextVoicemailRetry(1, 0), '1970-01-01T00:01:00.000Z');
  assert.equal(nextVoicemailRetry(2, 0), '1970-01-01T00:02:00.000Z');
  assert.equal(nextVoicemailRetry(4, 0), '1970-01-01T00:08:00.000Z');
  assert.equal(nextVoicemailRetry(5, 0), null);
  assert.throws(() => nextVoicemailRetry(0));
  assert.throws(() => nextVoicemailRetry(6));
});
test('audio format detection uses bytes rather than filename', () => {
  assert.equal(voicemailAudioType(Uint8Array.from([73,68,51,0,0,0,0,0,0,0,0,0])), 'audio/mpeg');
  assert.equal(voicemailAudioType(Uint8Array.from([82,73,70,70,0,0,0,0,87,65,86,69])), 'audio/wav');
  assert.equal(voicemailAudioType(Uint8Array.from([79,103,103,83,0,0,0,0,0,0,0,0])), 'audio/ogg');
  assert.equal(voicemailAudioType(Uint8Array.from([0,0,0,0,102,116,121,112,0,0,0,0])), 'audio/mp4');
  assert.equal(voicemailAudioExtension('audio/wav'), 'wav');
  assert.throws(() => voicemailAudioType(new Uint8Array(12)));
});
