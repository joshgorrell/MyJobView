import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const moduleFrom = source => import('data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText).toString('base64'));
const { bidEmailBatches } = await moduleFrom(await readFile(new URL('../../supabase/functions/lost-opportunity-review/bidEmailBatches.ts', import.meta.url), 'utf8'));
const huge = Array.from({ length: 5 }, (_, i) => ({ filename: `bid-${i}.pdf`, content: 'a'.repeat(14_000_000) }));
const batches = bidEmailBatches(huge);
assert.equal(batches.length, 5);
assert.deepEqual(batches.flat().map(a => a.filename), huge.map(a => a.filename));
assert.ok(batches.every(b => b.reduce((n, a) => n + a.content.length, 0) <= 18_000_000));
assert.deepEqual(bidEmailBatches([]), [[]], 'No-file response still generates one email');
let detail, stored, permitted = true, moduleAccess = true, user = 'employee-1';
const emails = [], uploads = [];
function reset() { detail = { request_id: 'request-1', organization_id: 'org-1', opportunity_name: 'Home theater', responded_at: null, reviewed_at: null, reviewed_by: null }; stored = null; emails.length = uploads.length = 0; }
function from(table) {
  const filters = {}; let update, insert;
  const q = { select: () => q, eq: (k, v) => { filters[k] = v; return q; }, is: (k, v) => { filters[k] = v; return q; },
    update: v => { update = v; return q; }, insert: v => { insert = v; return q; }, single: async () => result(), maybeSingle: async () => result(), then: (ok, fail) => Promise.resolve(result()).then(ok, fail) };
  function result() {
    if (table === 'lost_review_tokens') return { data: { request_id: 'request-1', expires_at: '2099-01-01' } };
    if (table === 'profiles') return { data: { organization_id: 'org-1', is_active: true, can_view_lost_opportunity_submissions: permitted } };
    if (table === 'lost_review_details') {
      if (filters.organization_id && filters.organization_id !== detail.organization_id) return { error: { message: 'Not found' } };
      if (update && Object.entries(filters).every(([k, v]) => detail[k] === v)) Object.assign(detail, update);
      return { data: { ...detail } };
    }
    if (table === 'lost_review_responses') {
      if (insert) { stored = insert; detail.responded_at = new Date().toISOString(); }
      return { data: stored };
    }
    if (table === 'company_settings') return { data: { company_name: 'Test dealer', company_email: 'dealer@example.com' } };
    if (table === 'organizations') return { data: { subdomain: 'test' } };
    if (table === 'review_requests') return { data: { recipient_name: 'John Valley', recipient_email: 'customer@example.com' } };
    throw new Error('Unexpected table ' + table);
  }
  return q;
}
const client = { from, auth: { getUser: async () => ({ data: { user: user ? { id: user } : null } }) }, rpc: async name => ({ data: name === 'flow_has_module_access' ? moduleAccess : [{ email: 'reviewer@example.com' }] }),
  storage: { from: () => ({ upload: async (path, bytes) => { uploads.push({ path, bytes }); return { data: {} }; }, remove: async () => ({ data: {} }), createSignedUrl: async path => ({ data: { signedUrl: 'https://private.example/' + path } }) }) } };
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => { assert.equal(url, 'https://api.resend.com/emails'); emails.push(JSON.parse(options.body)); return new Response('{}', { status: 200 }); };
globalThis.__lostDeps = { createClient: () => client, bidEmailBatches, wrapInEmailLayout: html => html };
const source = (await readFile(new URL('../../supabase/functions/lost-opportunity-review/index.ts', import.meta.url), 'utf8')).replace(/^import[^;]+;\n/gm, '');
await moduleFrom(`const {createClient,bidEmailBatches,wrapInEmailLayout}=globalThis.__lostDeps;
const Deno={env:{get:key=>key==='RESEND_API_KEY'?'test-key':''},serve:handler=>{globalThis.__lostHandler=handler;}};
${source}`);
async function call(body) { const r = await globalThis.__lostHandler(new Request('https://test.example', { method: 'POST', body: JSON.stringify(body) })); return { status: r.status, body: await r.json() }; }
reset();
const file = { name: 'John & Valley.pdf', type: 'application/pdf', data: Buffer.from('%PDF-1.7\nTest bid').toString('base64') };
const submission = { action: 'submit', token: 'test-token', reasons: ['price'], message: 'Here is the bid', recoverable: 'maybe', recovery_message: '', files: [file] };
assert.equal((await call(submission)).status, 200);
assert.equal(uploads.length, 1);
assert.equal(stored.attachments[0].path, uploads[0].path, 'Stored bid remains associated with response');
assert.equal(emails.length, 1);
assert.deepEqual(emails[0].attachments, [{ filename: file.name, content: file.data }]);
assert.ok(emails[0].html.includes('John &amp; Valley.pdf'));
assert.equal(emails[0].to, 'reviewer@example.com');
assert.equal(detail.reviewed_at, null, 'Email notification does not complete review');
assert.equal((await call(submission)).body.already_submitted, true);
assert.equal(emails.length, 1, 'Duplicate submit does not resend notifications');
assert.equal((await call({ action: 'download', request_id: 'request-1', path: stored.attachments[0].path })).status, 200);
assert.equal((await call({ action: 'download', request_id: 'request-1', path: 'another-file' })).status, 404);
permitted = false;
assert.equal((await call({ action: 'review', request_id: 'request-1' })).status, 403);
assert.equal(detail.reviewed_at, null);
permitted = true; moduleAccess = false;
assert.equal((await call({ action: 'review', request_id: 'request-1' })).status, 403);
moduleAccess = true;
const first = await call({ action: 'review', request_id: 'request-1' });
assert.equal(first.status, 200);
assert.ok(first.body.reviewed_at);
assert.equal(first.body.reviewed_by, 'employee-1');
user = 'employee-2';
assert.deepEqual((await call({ action: 'review', request_id: 'request-1' })).body, first.body, 'Repeat viewing preserves first reviewer and timestamp');
const realConsoleError = console.error;
const expectedErrors = [];
console.error = (...args) => expectedErrors.push(args[0]);
detail.organization_id = 'org-2';
assert.equal((await call({ action: 'review', request_id: 'request-1' })).status, 400, 'Cross-company review is denied');
reset();
assert.equal((await call({ action: 'review', request_id: 'request-1' })).status, 400, 'Awaiting response cannot be completed');
assert.equal((await call({ ...submission, files: [] })).status, 200);
assert.deepEqual(emails[0].attachments, []);
globalThis.fetch = async () => new Response('{}', { status: 500 });
reset();
assert.equal((await call(submission)).body.success, true, 'Mail failure does not discard customer feedback');
assert.ok(stored);
console.error = realConsoleError;
assert.ok(expectedErrors.includes('Lost review notification email failed'));
globalThis.fetch = realFetch;
delete globalThis.__lostDeps; delete globalThis.__lostHandler;
console.log('Lost review edge checks passed: actual bid attachments, large-file batches, downloads, automatic review audit, authorization, tenant isolation, repeat submissions and notification failure.');
