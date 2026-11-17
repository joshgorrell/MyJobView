import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const load = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const dataUrl = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const renderUrl = dataUrl(compile(load('../../supabase/functions/_shared/sms-template-render.ts')));
const queueUrl = dataUrl(compile(load('../../supabase/functions/_shared/sms-template-queue.ts'))
  .replace(/(['"])\.\/sms-template-render\.ts\1/, (_, q) => q + renderUrl + q));
const bridgeUrl = dataUrl(compile(load('../../supabase/functions/_shared/sms-appointment-event.ts'))
  .replace(/(['"])\.\/sms-template-queue\.ts\1/, (_, q) => q + queueUrl + q));
const { queueAppointmentReminder } = await import(bridgeUrl);
const org = '00000000-0000-0000-0000-000000000001';
const contact = '00000000-0000-0000-0000-000000000002';
const id = '00000000-0000-0000-0000-000000000003';
const appointment = { id, organizationId: org, contactId: contact, customerName: 'Alex',
  companyName: 'Dealer', appointmentDate: 'Dec 3', appointmentTime: '2 PM',
  status: 'confirmed', reminderRevision: 'r1' };
let queued = [], lookedUp = 0;
const db = {
  from: () => ({
    select: () => ({
      eq: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { body: 'Hi {customer_name}, {appointment_date} at {appointment_time}' }, error: null }),
        }),
      }),
    }),
  }),
  rpc: async (name, args) => { queued.push({ name, args }); return { data: 'queued', error: null }; },
};
const resolve = async key => { lookedUp++; assert.equal(key, id); return appointment; };
assert.equal(await queueAppointmentReminder(db, resolve, id, org), 'queued');
assert.equal(queued[0].args.p_event_key, 'appointment:' + id + ':reminder:r1');
assert.equal(queued[0].args.p_body, 'Hi Alex, Dec 3 at 2 PM');
for (const change of [
  { organizationId: contact }, { status: 'cancelled' }, { status: 'completed' },
  { contactId: 'bad' }, { reminderRevision: '../other' }, { customerName: '' },
]) {
  const before = queued.length;
  await assert.rejects(queueAppointmentReminder(db, async () => ({ ...appointment, ...change }), id, org));
  assert.equal(queued.length, before, 'Ineligible appointment must not enqueue');
}
await assert.rejects(queueAppointmentReminder(db, async () => null, id, org));
await assert.rejects(queueAppointmentReminder(db, resolve, 'bad', org));
assert.equal(queued.length, 1);
assert.ok(lookedUp >= 1);
console.log('Appointment SMS bridge: authoritative scope, eligibility, idempotency and suppression pass');
