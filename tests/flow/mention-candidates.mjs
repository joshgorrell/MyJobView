import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';
import vm from 'node:vm';

const source = await readFile('src/lib/flow/mentionCandidates.ts', 'utf8');
const { code } = await transform(source.replace(/export /g, ''), { loader: 'ts', format: 'cjs' });
const context = { exports: {}, module: { exports: {} } };
vm.runInNewContext(code + '\nmodule.exports.find = findEmployeeMentionCandidates;', context);
const find = context.module.exports.find;
const people = [
  { id: 'luis', full_name: 'Luis Garcia', username: 'lgarcia' },
  { id: 'tim', full_name: 'Tim Miller', username: 'tmiller' },
  { id: 'tim2', full_name: 'Tim Jones', username: 'tjones' },
];
const names = (text) => Array.from(find(text, people), c => ({ text: c.text, ids: Array.from(c.personIds), explicit: c.explicit }));
assert.deepEqual(names('Hey Luis Garcia, ask Tim'), [
  { text: 'Luis Garcia', ids: ['luis'], explicit: false },
  { text: 'Tim', ids: ['tim','tim2'], explicit: false },
]);
assert.deepEqual(names('at Luis please'), [{ text: 'at Luis', ids: ['luis'], explicit: true }]);
assert.deepEqual(names('@Tim Miller please'), [{ text: '@Tim Miller', ids: ['tim'], explicit: true }]);
assert.deepEqual(names('no one mentioned'), []);
// Guard the persisted notification path as well as the visual name recognizer.
const coworker = await readFile('src/components/Flow/coworkerConversations.ts', 'utf8');
const composer = await readFile('src/components/Flow/CustomerConversations.tsx', 'utf8');
assert.ok(coworker.includes(String.raw`content.matchAll(/(?:^|[^\w])@([a-z0-9]+)/gi)`));
assert.match(coworker, /\.eq\('organization_id', organizationId\)\.eq\('is_active', true\)\.in\('username', usernames\)/);
assert.match(composer, /const canMentionStaff = selectedThread\?\.source === 'coworker';/);
assert.deepEqual(Array.from('Hello @lgarcia, @tmiller and email@external.com'.matchAll(/(?:^|[^\w])@([a-z0-9]+)/gi), m => m[1]), ['lgarcia', 'tmiller']);
console.log('PASS: natural, spoken, ambiguous and absent names; scoped confirmed mention notifications');
