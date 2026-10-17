import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
const source = fs.readFileSync('src/lib/smart-intake/identity.ts', 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const exports = {};
vm.runInNewContext(js, { exports });
const contacts = [
  { id: 'one', organizationId: 'dealer-one', email: 'same@example.com' },
  { id: 'two', organizationId: 'dealer-two', email: 'same@example.com' },
];
assert.equal(exports.matchIntakeContact('dealer-one', 'same@example.com', null, contacts).contactId, 'one');
assert.equal(exports.matchIntakeContact('dealer-two', 'same@example.com', null, contacts).contactId, 'two');
assert.equal(exports.matchIntakeContact('dealer-three', 'same@example.com', null, contacts).status, 'unmatched');
console.log('Dealer isolation checks passed');
