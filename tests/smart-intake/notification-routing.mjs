import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
const exports = {};
const src = fs.readFileSync('src/lib/smart-intake/notification-routing.ts','utf8');
vm.runInNewContext(ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports});
const members = [
{userId:'bobbi',departmentIds:['service'],canAccessServiceCenter:true,active:true},
{userId:'jp',departmentIds:['service'],canAccessServiceCenter:true,active:true},
{userId:'other',departmentIds:['service'],canAccessServiceCenter:true,active:true},
{userId:'inactive',departmentIds:['service'],canAccessServiceCenter:true,active:false},
{userId:'sales',departmentIds:['sales'],canAccessServiceCenter:false,active:true}
];
const settings = {serviceDepartmentId:'service',recipientUserIds:['bobbi','jp','inactive','sales'],notifyKinds:['new_request','urgent']};
assert.deepEqual(Array.from(exports.resolveIntakeNotificationRecipients(members,settings,'new_request')),['bobbi','jp']);
assert.equal(exports.resolveIntakeNotificationRecipients(members,settings,'needs_review').length,0);
assert.equal(exports.canHandleServiceIntake(members[2],'service'),true);
assert.equal(exports.canHandleServiceIntake(members[4],'service'),false);
console.log('Department intake notification rules passed');
