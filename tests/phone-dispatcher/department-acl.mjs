import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync(new URL('../../supabase/functions/_shared/phone-voicemail-acl.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { permittedVoicemailDepartments, canReadVoicemail } =
  await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
test('admins can read all non-quarantined voicemail including unclassified review', () => {
  assert.equal(canReadVoicemail('admin', [], null, 'review'), true);
  assert.equal(canReadVoicemail('admin', [], 'security', 'ready'), true);
  assert.equal(canReadVoicemail('admin', [], 'security', 'quarantined'), false);
});
test('staff can read only explicitly granted departments', () => {
  assert.deepEqual(permittedVoicemailDepartments('employee', ['service', 'invalid']), ['service']);
  assert.equal(canReadVoicemail('employee', ['service'], 'service', 'ready'), true);
  assert.equal(canReadVoicemail('employee', ['service'], 'sales', 'ready'), false);
  assert.equal(canReadVoicemail('employee', ['service'], null, 'review'), false);
  assert.equal(canReadVoicemail('employee', [], 'service', 'ready'), false);
  assert.equal(canReadVoicemail('employee', ['service'], 'service', 'failed'), false);
});
