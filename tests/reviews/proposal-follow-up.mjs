import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import ts from 'typescript';
const moduleFrom = source => import('data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText).toString('base64'));
const layout = await moduleFrom((await readFile('supabase/functions/_shared/emailTemplates.ts', 'utf8')).replace(/^import[^;]+;\n/gm, ''));
globalThis.__layout = layout.wrapInEmailLayout;
const template = (await readFile('supabase/functions/lost-opportunity-review/proposalFollowUp.ts', 'utf8')).replace(/^import[^;]+;\n/gm, '');
const { proposalFollowUpEmail } = await moduleFrom('const wrapInEmailLayout = globalThis.__layout;\n' + template);
const settings = { company_name: 'Electronic Life', company_email: 'office@example.com', company_logo_url: 'https://example.com/logo.png', slogan: 'Innovate. Integrate. Inspire.' };
for (const owner of [false, true]) {
  const html = proposalFollowUpEmail(settings, { first_name: '<script>Bad</script>' }, { name: owner ? 'Josh Gorrell' : 'Aaron Koker', email: owner ? 'josh@electroniclife.com' : 'aaron@example.com', owner });
  assert.ok(html.includes('How are we doing?'));
  assert.ok(html.includes(owner ? 'Reply to Josh' : 'Let Us Know'));
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('Thank you for your business.'));
  if (owner) await writeFile('/tmp/mjv-owner-followup-preview.html', html);
}
let role = 'admin', moduleAccess = true, permission = true, tenant = 'elife', status = 'sent', sentAt = '2026-10-01';
const emails = [];
function from(table) {
  const filters = {};
  const q = { select: () => q, eq: (k,v) => { filters[k]=v; return q; }, single: async () => {
    if (table === 'profiles') return { data: filters.id === 'rep' ? { first_name: 'Aaron', last_name: 'Koker', email: 'aaron@example.com', is_active: true } : { organization_id: 'org', first_name: 'Michael', last_name: 'Colley', email: 'michael@example.com', role, is_active: true, can_manage_customer_feedback: permission } };
    if (table === 'proposals') return filters.organization_id === 'org' && filters.id === 'proposal' ? { data: { status, sent_at: sentAt, contact_id: 'contact', created_by: 'rep' } } : { error: { message: 'Not found' } };
    if (table === 'contacts') return filters.id === 'contact' && filters.organization_id === 'org' ? { data: { first_name: 'Customer', email: 'customer@example.com' } } : { error: { message: 'Not found' } };
    if (table === 'company_settings') return { data: { ...settings, from_email: 'verified@example.com' } };
    if (table === 'organizations') return { data: { subdomain: tenant } };
    throw new Error(table);
  } }; return q;
}
const client = { from, auth: { getUser: async () => ({data:{ user:{id:'employee'} }}) }, rpc: async () => ({data:moduleAccess}) };
globalThis.__deps = { proposalFollowUpEmail, createClient: () => client, sendSystemEmail: async init => { emails.push(JSON.parse(init.body)); return new Response('{}'); } };
const source = (await readFile('supabase/functions/lost-opportunity-review/index.ts','utf8')).replace(/^import[^;]+;\n/gm,'');
await moduleFrom(`const {proposalFollowUpEmail,createClient,sendSystemEmail}=globalThis.__deps;const Deno={env:{get:()=> 'test'},serve:f=>globalThis.handler=f};\n${source}`);
async function call(extra={}) { const r = await globalThis.handler(new Request('https://example.com', { method:'POST', body:JSON.stringify({ action:'proposal_preview',proposal_id:'proposal',variant:'owner',...extra }) })); return {status:r.status,body:await r.json()}; }
assert.equal((await call()).body.reply_to,'josh@electroniclife.com');
assert.equal(emails.length,0,'Preview must never send');
role='employee'; assert.equal((await call()).status,403);
assert.equal((await call({variant:'sales'})).body.reply_to,'aaron@example.com');
permission=false; assert.equal((await call({variant:'sales'})).status,403);
role='admin'; tenant='other'; assert.equal((await call()).status,400);
tenant='elife'; status='approved'; assert.equal((await call()).status,400);
status='sent'; sentAt=null; assert.equal((await call()).status,400);
sentAt='2026-10-01'; moduleAccess=false; assert.equal((await call()).status,403);
moduleAccess=true; assert.equal((await call({action:'proposal_send'})).status,400);
assert.equal((await call({action:'proposal_send',send_key:crypto.randomUUID()})).status,200);
assert.equal(emails[0].reply_to,'josh@electroniclife.com');
assert.equal(emails[0].from,'Josh Gorrell <verified@example.com>');
console.log('Proposal follow-up rendering, permissions, eligibility, preview, and sender routing passed.');

// Optional-link follow-ups use the authenticated sender and never create contacts.
const manual = { recipient_mode: 'manual', proposal_id: undefined, recipient_name: 'Jane Customer', recipient_email: 'jane@example.com' };
assert.equal((await call(manual)).body.recipient, 'jane@example.com');
assert.equal((await call({ ...manual, variant: 'sales' })).body.reply_to, 'michael@example.com');
assert.equal((await call({ recipient_mode: 'customer', proposal_id: undefined, contact_id: 'contact', variant: 'sales' })).body.recipient, 'customer@example.com');
const originalError = console.error; console.error = () => {};
assert.equal((await call({ recipient_mode: 'customer', proposal_id: undefined, contact_id: 'foreign-contact' })).status, 400);
console.error = originalError;
for (const invalid of ['', 'bad-address', 'a@example.com,other@example.com', 'a@example.com\r\nBcc:other@example.com']) {
  assert.equal((await call({ ...manual, recipient_email: invalid })).status, 400);
}
assert.equal((await call({ ...manual, recipient_name: ' ' })).status, 400);
assert.equal((await call({ ...manual, action: 'proposal_send', send_key: crypto.randomUUID() })).status, 200);
assert.equal(emails.at(-1).to, 'jane@example.com');
assert.equal(emails.at(-1).reply_to, 'josh@electroniclife.com');
console.log('Customer selection, manual recipients, email validation and unlinked sender routing passed.');
