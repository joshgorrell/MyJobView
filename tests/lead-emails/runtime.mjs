import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';
const source = await readFile('supabase/functions/_shared/lead-email-template.ts', 'utf8');
const { code } = await transform(source, { loader: 'ts', format: 'cjs' });
const module = { exports: {} };
new Function('module','exports',code)(module,module.exports);
const { renderLeadEmail, buildLeadUrl } = module.exports;
const lead = { id: 'test-lead', organization_id: 'org', contact_name: 'Alex & Casey', company_name: 'Example Company', email: 'alex@example.com', phone: '785-555-0100', lead_source: 'website', status: 'claimed', assigned_to: 'rep', is_fishbowl: false, created_at: '2026-10-08T15:30:00Z', opportunity_description: 'Home theater installation.\n<script>alert(1)</script>' };
const leadUrl = buildLeadUrl('https://example.myjobview.com/?old=value', lead.id, false);
assert.equal(new URL(leadUrl).searchParams.get('leadId'), lead.id);
assert.equal(new URL(leadUrl).searchParams.get('tab'), 'leads');
assert.equal(new URL(leadUrl).searchParams.has('old'), false);
assert.throws(() => buildLeadUrl(null, lead.id, false));
assert.throws(() => buildLeadUrl('javascript:alert(1)', lead.id, false));
const params = { lead, leadUrl, isFishbowl: false, repName: 'Aaron', companyName: 'Electronic Life', creatorName: 'Josh', assignedName: 'Aaron', officeName: 'Topeka' };
const message = renderLeadEmail(params);
for (const value of ['WooHoo! You got a new Lead!', 'alex@example.com', '785-555-0100', 'Topeka', 'Josh', 'Aaron', 'Home theater installation.']) assert.ok(message.html.includes(value), value);
assert.ok(message.html.includes('Alex &amp; Casey'));
assert.ok(message.html.includes('&lt;script&gt;'));
assert.ok(!message.html.includes('<script>'));
assert.ok(message.text.includes(leadUrl));
assert.ok(!message.html.includes('Thank you for your business'));
const fish = renderLeadEmail({ ...params, isFishbowl: true, leadUrl: buildLeadUrl('https://example.myjobview.com',lead.id,true) });
assert.ok(fish.html.includes('View & Claim Lead'));
assert.ok(fish.html.includes('tab=fishbowl'));

const endpoint = await readFile('supabase/functions/send-lead-notification/index.ts','utf8');
const stripped = endpoint.replace(/^import .*;\n/gm, '');
const transformed = await transform(stripped, { loader: 'ts', format: 'cjs' });
async function run({ token = 'staff-token', emails = ['aaron@example.com'], enabled = true, accessible = true, fishbowl = false, providerOk = true } = {}) {
  let handler;
  const sent = [];
  const queries = [];
  const dbLead = { ...lead, is_fishbowl: fishbowl, assigned_to: fishbowl ? null : 'rep' };
  const createClient = (url,key,options) => ({
    auth: { getUser: async () => ({ data: { user: token === 'invalid' ? null : { id: 'actor' } }, error: null }) },
    from(table) {
      const q = { table, select: '', filters: {}, reader: Boolean(options) }; queries.push(q);
      const chain = { select(s) { q.select=s; return chain; }, eq(k,v) { q.filters[k]=v; return chain; }, in(k,v) { q.filters[k]=v; return chain; },
        single: async () => ({ data: accessible ? dbLead : null, error: accessible ? null : 'denied' }),
        maybeSingle: async () => ({ data: { office_name: 'Topeka' }, error: null }),
        then(resolve) {
          const recipients = [{id:'rep',email:'aaron@example.com',full_name:'Aaron',notify_on_fishbowl:true}];
          const data = q.filters.email ? (enabled ? recipients.filter(r => q.filters.email.includes(r.email)) : []) : [{id:'rep',full_name:'Aaron'}];
          resolve({ data, error:null });
        },
      }; return chain;
    },
  });
  const deno = { env: { get: k => ({ SUPABASE_URL: 'https://db.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-key', SUPABASE_ANON_KEY: 'anon-key', RESEND_API_KEY: 'email-key' })[k] }, serve: fn => { handler=fn; } };
  const settings = async () => ({ app_url:'https://example.myjobview.com', company_name:'Electronic Life', from_address:'Electronic Life <sender@example.com>' });
  new Function('Deno','createClient','sendSystemEmail','getCompanySettings','buildLeadUrl','renderLeadEmail', transformed.code)(deno,createClient,async req => { sent.push(JSON.parse(req.body)); return {ok:providerOk}; },settings,buildLeadUrl,renderLeadEmail);
  const response = await handler(new Request('https://db/functions/send-lead-notification', { method:'POST', headers:{ Authorization:`Bearer ${token}` }, body:JSON.stringify({leadId:lead.id,to:emails}) }));
  return { status:response.status, body:await response.json(), sent, queries };
}
const assigned = await run();
assert.equal(assigned.body.sent,1);
assert.equal(assigned.sent[0].to[0],'aaron@example.com');
assert.ok(assigned.queries.find(q=>q.table==='leads').reader);
assert.ok(assigned.queries.filter(q=>q.table==='profiles').every(q=>q.filters.organization_id==='org'));
assert.equal((await run({ enabled:false })).sent.length,0);
assert.equal((await run({ emails:['outsider@example.com'] })).sent.length,0);
assert.equal((await run({ accessible:false })).status,404);
assert.equal((await run({ token:'invalid' })).status,401);
assert.equal((await run({ providerOk:false })).status,502);
assert.ok((await run({ token:'service-key', fishbowl:true })).sent[0].subject.includes('Fishbowl'));
console.log('Lead email rendering, deep links, tenant scope, recipient preferences, authentication and provider failures passed.');
