import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/lib/phoneDispatcherCallerMatch.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { matchVoicemailCaller, normalizeNorthAmericanPhone } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

const contacts = [
  { id: 'a', organization_id: 'el', phone: '(785) 555-0100' },
  { id: 'b', organization_id: 'other', phone: '7855550100' },
  { id: 'c', organization_id: 'el', mobile_phone: '+1 785 555 0101' },
];

test('normalizes North American formats and strips extension', () => {
  assert.equal(normalizeNorthAmericanPhone('785-555-0100 ext. 42'), '+17855550100');
  assert.equal(normalizeNorthAmericanPhone('+1 (785) 555-0100'), '+17855550100');
});
test('rejects unsupported international, anonymous and malformed numbers', () => {
  assert.equal(normalizeNorthAmericanPhone('+44 20 1234 5678'), null);
  assert.equal(normalizeNorthAmericanPhone('Private'), null);
  assert.equal(normalizeNorthAmericanPhone('785-555-0100;drop'), null);
});
test('matches only within verified organization', () => {
  assert.deepEqual(matchVoicemailCaller('el', '7855550100', contacts), { kind: 'matched', contactId: 'a' });
  assert.deepEqual(matchVoicemailCaller('other', '7855550100', contacts), { kind: 'matched', contactId: 'b' });
});
test('matches mobile and business numbers without modifying contacts', () => {
  assert.deepEqual(matchVoicemailCaller('el', '7855550101', contacts), { kind: 'matched', contactId: 'c' });
});
test('returns unmatched rather than creating a lead', () => {
  assert.deepEqual(matchVoicemailCaller('el', '7855550199', contacts), { kind: 'unmatched' });
});
test('flags duplicate matches for review', () => {
  assert.deepEqual(matchVoicemailCaller('el', '7855550100', [...contacts, { id: 'd', organization_id: 'el', business_phone: '7855550100' }]), { kind: 'ambiguous', contactIds: ['a', 'd'] });
});
test('requires a tenant and handles missing caller ID', () => {
  assert.throws(() => matchVoicemailCaller('', '7855550100', contacts));
  assert.deepEqual(matchVoicemailCaller('el', null, contacts), { kind: 'invalid_number' });
});
