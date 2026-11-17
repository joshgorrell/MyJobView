import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const renderSource = readFileSync(new URL('../../supabase/functions/_shared/sms-template-render.ts', import.meta.url), 'utf8');
const adapterSource = readFileSync(new URL('../../supabase/functions/_shared/sms-template-queue.ts', import.meta.url), 'utf8');
const transpile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const renderUrl = 'data:text/javascript;base64,' + Buffer.from(transpile(renderSource)).toString('base64');
const adapterUrl = 'data:text/javascript;base64,' +
  Buffer.from(transpile(adapterSource).replace(/(['"])\.\/sms-template-render\.ts\1/, (_, quote) => quote + renderUrl + quote)).toString('base64');
const { queueTemplatedSms } = await import(adapterUrl);
const org = '00000000-0000-0000-0000-000000000001';
const contact = '00000000-0000-0000-0000-000000000002';
let query = [], calls = [], body = 'Hello {customer_name}, your appointment is {appointment_date}.', failure = null;
const db = {
  from(table) {
    assert.equal(table, 'sms_message_templates');
    return { select(columns) {
      assert.equal(columns, 'body');
      return { eq(column, value) {
        query.push([column, value]);
        return { eq(secondColumn, secondValue) {
          query.push([secondColumn, secondValue]);
          return { async maybeSingle() { return { data: body === null ? null : { body }, error: failure }; } };
        } };
      } };
    } };
  },
  async rpc(name, args) {
    calls.push({ name, args });
    return { data: 'dispatch-id', error: null };
  },
};
const event = { organizationId: org, contactId: contact, category: 'appointment_reminder',
  eventKey: 'appointment:123:reminder:24h', values: { customer_name: 'Alex', appointment_date: 'Dec 3' } };
assert.equal(await queueTemplatedSms(db, event), 'dispatch-id');
assert.deepEqual(query, [['organization_id', org], ['category', 'appointment_reminder']]);
assert.equal(calls.length, 1);
assert.equal(calls[0].name, 'enqueue_sms_dispatch');
assert.equal(calls[0].args.p_body, 'Hello Alex, your appointment is Dec 3.');
assert.equal(calls[0].args.p_organization_id, org);
assert.equal(calls[0].args.p_contact_id, contact);
body = null;
await assert.rejects(queueTemplatedSms(db, event), /not configured/);
assert.equal(calls.length, 1, 'Missing dealer template must not enqueue');
body = 'Hi {unsupported}';
await assert.rejects(queueTemplatedSms(db, event), /Unsupported/);
assert.equal(calls.length, 1, 'Unsupported placeholders must not enqueue');
body = 'Hi {customer_name}';
failure = { message: 'database unavailable' };
await assert.rejects(queueTemplatedSms(db, event), /Could not load/);
assert.equal(calls.length, 1, 'Failed lookup must not enqueue');
await assert.rejects(queueTemplatedSms(db, { ...event, organizationId: 'bad' }), /Invalid/);
assert.equal(calls.length, 1, 'Invalid organization must not enqueue');
console.log('SMS template queue: scoped lookup, rendering and fail-closed guards pass');
