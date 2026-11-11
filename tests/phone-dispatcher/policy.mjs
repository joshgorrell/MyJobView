import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/lib/phoneDispatcherPolicy.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { decideVoicemail, voicemailDedupeKey } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

test('high confidence spam is quarantined for 30 days without staff notification', () => {
  assert.deepEqual(decideVoicemail({ spamConfidence: 0.99, department: null, departmentConfidence: 0 }), {
    kind: 'junk', notifyAdmin: false, retentionDays: 30,
  });
});
test('ambiguous spam is escalated instead of silently dropped', () => {
  assert.equal(decideVoicemail({ spamConfidence: 0.5, department: 'sales', departmentConfidence: 0.99 }).kind, 'review');
});
test('uncertain department goes to administrator', () => {
  assert.deepEqual(decideVoicemail({ spamConfidence: 0.01, department: 'service', departmentConfidence: 0.7 }), {
    kind: 'review', notifyAdmin: true, reason: 'uncertain_department',
  });
});
test('confident legitimate voicemail routes to the existing department', () => {
  assert.deepEqual(decideVoicemail({ spamConfidence: 0.01, department: 'security', departmentConfidence: 0.99 }), {
    kind: 'route', notifyAdmin: false, department: 'security',
  });
});
test('failed or missing classification always escalates', () => {
  assert.equal(decideVoicemail({ spamConfidence: null, department: null, departmentConfidence: null }).kind, 'review');
  assert.equal(decideVoicemail({ spamConfidence: 0, department: 'sales', departmentConfidence: 1, failed: true }).kind, 'review');
});
test('message deduplication identity includes tenant and account', () => {
  assert.notEqual(voicemailDedupeKey('org-a', 'account-1', 'message-1'), voicemailDedupeKey('org-b', 'account-1', 'message-1'));
  assert.throws(() => voicemailDedupeKey('', 'account-1', 'message-1'));
});
