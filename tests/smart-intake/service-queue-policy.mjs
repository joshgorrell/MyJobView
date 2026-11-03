import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
const exports = {};
const source = fs.readFileSync('src/lib/smart-intake/service-queue-policy.ts','utf8');
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports});
const members = [
{userId:'bobbi',organizationId:'electronic-life',canAccessServiceCenter:true,notificationsEnabled:false,active:true},
{userId:'jp',organizationId:'electronic-life',canAccessServiceCenter:true,notificationsEnabled:true,active:true},
{userId:'other',organizationId:'other-dealer',canAccessServiceCenter:true,notificationsEnabled:true,active:true}
];
assert.equal(exports.serviceQueueVisibility(members[0],'electronic-life'),true);
assert.deepEqual(Array.from(exports.serviceIntakeNotificationRecipients(members,'electronic-life')),['jp']);
assert.equal(exports.shouldAutoAssignServiceRequest(),false);
console.log('Shared service queue and opt-in notification rules passed');
