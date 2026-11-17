import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../../supabase/functions/_shared/sms-template-render.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { renderSmsTemplate: render } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

assert.equal(render('appointment_reminder', 'Hi {customer_name}, {appointment_date} at {appointment_time}', {
  customer_name: 'Alex', appointment_date: 'Dec 3', appointment_time: '2 PM',
}), 'Hi Alex, Dec 3 at 2 PM');
assert.equal(render('review_request', 'Review: {review_link}', {
  review_link: 'https://example.com/review',
}), 'Review: https://example.com/review');
for (const [category, template, values] of [
  ['review_request', 'Hi {unknown}', { unknown: 'value' }],
  ['review_request', 'Hi {customer_name}', {}],
  ['review_request', 'Hi {customer_name}', { customer_name: 'A\nB' }],
  ['review_request', 'Hi {customer_name', { customer_name: 'Alex' }],
  ['review_request', 'Hi {review_link}', { review_link: 'http://example.com' }],
  ['review_request', 'Hi {review_link}', { review_link: 'https://user:pass@example.com' }],
  ['review_request', 'x'.repeat(1601), {}],
  ['proposal_notification', 'Hi {proposal_link}', { proposal_link: 'javascript:alert(1)' }],
]) assert.throws(() => render(category, template, values));
assert.throws(() => render('on_my_way', 'Hi', {}));
assert.throws(() => render('review_request', '{customer_name}', { customer_name: 'x'.repeat(1601) }));
console.log('SMS template renderer: valid placeholders, malformed inputs, HTTPS links and length guards pass');
