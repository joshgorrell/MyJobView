import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

function compile(path) {
  return ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}
const dataUrl = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const policyUrl = dataUrl(compile('../../src/lib/phoneDispatcherPolicy.ts'));
const aiUrl = dataUrl(compile('../../src/lib/phoneDispatcherAI.ts').replace(
  "from './phoneDispatcherPolicy'", "from '" + policyUrl + "'",
));
const processing = compile('../../src/lib/phoneDispatcherProcessing.ts')
  .replace("from './phoneDispatcherAI'", "from '" + aiUrl + "'")
  .replace("from './phoneDispatcherPolicy'", "from '" + policyUrl + "'");
const { processVerifiedVoicemail } = await import(dataUrl(processing));

const message = {
  organizationId: 'org-a', ringcentralAccountId: 'rc-a', messageId: 'vm-1',
  mailboxId: 'box-1', callerNumber: '7855550100',
  recordingReference: 'recording-1', receivedAt: '2026-11-11T12:00:00Z',
};
function setup(overrides = {}) {
  const calls = [];
  const dependencies = {
    async claim(key) { calls.push(['claim', key]); return true; },
    async fetchRecording() { calls.push(['fetch']); return new Uint8Array([1, 2, 3]); },
    async transcribe() { calls.push(['transcribe']); return 'My alarm is going off, please call.'; },
    async classify(transcript) {
      calls.push(['classify', transcript]);
      return { summary: 'Alarm callback requested.', department: 'security',
        departmentConfidence: 0.99, spamConfidence: 0.01, urgent: true, callbackRequested: true };
    },
    async persist(_message, result) { calls.push(['persist', result]); },
    async fail(_key, reason) { calls.push(['fail', reason]); },
    ...overrides,
  };
  return { calls, dependencies };
}
test('transcribes and classifies content before persisting message', async () => {
  const { calls, dependencies } = setup();
  assert.deepEqual(await processVerifiedVoicemail(message, dependencies), { status: 'processed', decision: 'route' });
  assert.deepEqual(calls.map(c => c[0]), ['claim', 'fetch', 'transcribe', 'classify', 'persist']);
  assert.equal(calls[3][1], 'My alarm is going off, please call.');
  assert.equal(calls[4][1].transcript, 'My alarm is going off, please call.');
});
test('duplicate event never downloads or reprocesses audio', async () => {
  const { calls, dependencies } = setup({ claim: async () => false });
  assert.deepEqual(await processVerifiedVoicemail(message, dependencies), { status: 'duplicate' });
  assert.deepEqual(calls, []);
});
test('empty recording is marked retryable', async () => {
  const { calls, dependencies } = setup({ fetchRecording: async () => new Uint8Array() });
  assert.deepEqual(await processVerifiedVoicemail(message, dependencies), { status: 'retry', reason: 'recording_unavailable' });
  assert.ok(calls.some(c => c[0] === 'fail' && c[1] === 'recording_unavailable'));
});
test('classifier failure is retryable and not silently routed', async () => {
  const { calls, dependencies } = setup({ classify: async () => { throw Error('Unavailable'); } });
  assert.deepEqual(await processVerifiedVoicemail(message, dependencies), { status: 'retry', reason: 'processing_failed' });
  assert.equal(calls.some(c => c[0] === 'persist'), false);
});
test('uncertain AI result is persisted for human review', async () => {
  const { calls, dependencies } = setup({
    classify: async () => ({ summary: 'Unknown request', department: null,
      departmentConfidence: 0.1, spamConfidence: 0.4, urgent: false, callbackRequested: false }),
  });
  assert.deepEqual(await processVerifiedVoicemail(message, dependencies), { status: 'processed', decision: 'review' });
  assert.equal(calls.find(c => c[0] === 'persist')[1].decision.notifyAdmin, true);
});
test('tenant and account identity are mandatory', async () => {
  const { dependencies } = setup();
  await assert.rejects(processVerifiedVoicemail({ ...message, organizationId: '' }, dependencies));
});
