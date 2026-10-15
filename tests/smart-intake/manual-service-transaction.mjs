import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync('supabase/migrations/20261015100000_smart_intake_manual_service.sql', 'utf8');
const manualChannel = readFileSync('supabase/migrations/20261015110000_smart_intake_manual_channel.sql', 'utf8');
const channelRpc = readFileSync('supabase/migrations/20261015120000_smart_intake_manual_channel_rpc.sql', 'utf8');
assert.match(manualChannel, /'email','sms','mms','manual'/);
assert.match(channelRpc, /target_org,target_office,'manual','manual'/);
const form = readFileSync('src/components/Dispatch/ManualIntake.tsx', 'utf8');
const consoleView = readFileSync('src/components/Dispatch/ServiceRequestConsole.tsx', 'utf8');

for (const [name, pattern] of [
  ['authenticated actor', /actor uuid := \(select auth\.uid\(\)\)/],
  ['tenant scoped staff authorization', /smart_intake_staff_can_read\(target_org\)/],
  ['tenant scoped contact and office', /id=target_contact and organization_id=target_org and office_id=target_office/],
  ['real service request', /insert into public\.service_requests/],
  ['linked intake', /'processed','service',request_priority,target_contact,request_id/],
  ['audit event', /'manual_service_created'/],
  ['restricted execute', /grant execute on function public\.smart_intake_create_manual_service/],
]) assert.match(sql, pattern, name);

assert.match(form, /supabase\.rpc\('smart_intake_create_manual_service'/);
assert.match(form, /if \(submitError\) throw submitError/);
assert.match(form, /selectedCustomer\.office_id !== draft\.officeId/);
assert.match(form, /\(onCreated \?\? onClose\)\(\)/);
assert.match(consoleView, /setActiveTab\('queue'\)/);
assert.match(consoleView, /ServiceRequestQueue key=\{queueRevision\}/);
console.log('Manual service transaction contract passed');
