import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';

const source = fs.readFileSync('src/lib/smart-intake/identity.ts', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports = {};
vm.runInNewContext(compiled, { exports });
const { matchIntakeContact, normalizeIntakePhone } = exports;
const records = [
  { id: 'a', organizationId: 'dealer-a', email: 'bob@example.com', phone: '3165551212' },
  { id: 'b', organizationId: 'dealer-b', email: 'bob@example.com', phone: '3165551212' },
];
assert.equal(matchIntakeContact('dealer-a', 'BOB@example.com', null, records).contactId, 'a');
assert.equal(matchIntakeContact('dealer-a', null, null, records).status, 'unmatched');
assert.equal(matchIntakeContact('dealer-c', 'bob@example.com', null, records).status, 'unmatched');
assert.equal(normalizeIntakePhone('(316) 555-1212'), '+13165551212');
const duplicate = { id: 'c', organizationId: 'dealer-a', email: 'bob@example.com' };
assert.equal(matchIntakeContact('dealer-a', 'bob@example.com', null, [...records, duplicate]).status, 'ambiguous');
console.log('Smart Intake identity checks passed');
