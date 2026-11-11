import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const load = async path => {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return js;
};
const policy = await load('../../src/lib/phoneDispatcherPolicy.ts');
const ai = (await load('../../src/lib/phoneDispatcherAI.ts'))
  .replace("from './phoneDispatcherPolicy'", "from 'data:text/javascript;base64," + Buffer.from(policy).toString('base64') + "'");
const { buildVoicemailMessage, VOICEMAIL_CLASSIFIER_INSTRUCTIONS } = await import('data:text/javascript;base64,' + Buffer.from(ai).toString('base64'));

const sample = {
  transcript: 'My TV stopped working. Please call me.',
  summary: 'Customer requests repair and callback.',
  department: 'service', departmentConfidence: 0.99,
  spamConfidence: 0.01, urgent: false, callbackRequested: true,
};

test('AI content determines department; transcript is readable', () => {
  const message = buildVoicemailMessage(sample, true);
  assert.equal(message.decision.kind, 'route');
  assert.equal(message.decision.department, 'service');
  assert.equal(message.callbackRequested, true);
  assert.match(message.transcript, /TV stopped/);
});
test('missing recording or transcript requires review', () => {
  assert.equal(buildVoicemailMessage(sample, false).decision.kind, 'review');
  assert.equal(buildVoicemailMessage({ ...sample, transcript: '' }, true).decision.kind, 'review');
});
test('uncertain AI department is never automatically routed', () => {
  assert.equal(buildVoicemailMessage({ ...sample, departmentConfidence: 0.4 }, true).decision.kind, 'review');
});
test('spam is quarantined and retains transcript for review', () => {
  const result = buildVoicemailMessage({ ...sample, spamConfidence: 0.99 }, true);
  assert.equal(result.decision.kind, 'junk');
  assert.equal(result.decision.retentionDays, 30);
  assert.ok(result.transcript);
});
test('urgent messages cannot be silently quarantined as spam', () => {
  const result = buildVoicemailMessage({ ...sample, urgent: true, spamConfidence: 0.99 }, true);
  assert.equal(result.decision.kind, 'review');
  assert.ok(result.reviewReasons.includes('urgent_requires_review'));
});
test('transcript is sanitized for text display', () => {
  assert.equal(buildVoicemailMessage({ ...sample, transcript: 'hello\nworld\u0000' }, true).transcript, 'hello world');
});
test('prompt explicitly resists voicemail prompt injection', () => {
  assert.match(VOICEMAIL_CLASSIFIER_INSTRUCTIONS, /untrusted/);
});
