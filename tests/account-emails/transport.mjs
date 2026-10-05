import { Webhook } from 'standardwebhooks';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const env = { RESEND_API_KEY: 'test-key', SUPABASE_URL: 'https://test.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-service' };
globalThis.Deno = { env: { get: key => env[key] }, serve() {} };
let actor = { role: 'admin', is_active: true, organization_id: 'org-1' };
let target = { id: 'employee', email: 'employee@example.com', full_name: '<Employee>', is_active: true };
let settings = { company_name: 'Company', company_logo_url: 'https://dealer.example.com/logo.png', app_url: 'https://app.example.com', from_email: 'verified@example.com', from_name: 'Company', reply_to_email: 'help@example.com' };
let providerStatus = 200;
let redirectAllowed = true;
let updateFailure = false;
let generationCalls = 0;
let directChanges = 0;
let sent = [];
let updates = [];
let tracked = {};
globalThis.fetch = async (url, init) => { sent.push({ url, init, payload: JSON.parse(init.body) }); return new Response(JSON.stringify(providerStatus === 200 ? { id: 'email-123' } : { message: 'Sender not verified' }), { status: providerStatus }); };
globalThis.__createClient = () => ({
 auth: { getUser: async token => ({ data: { user: token === 'valid' ? { id: 'admin' } : null } }), admin: {
  generateLink: async args => { generationCalls++; return { data: { properties: { action_link: `https://test.supabase.co/auth/v1/verify?token=secret&type=recovery&redirect_to=${encodeURIComponent(redirectAllowed ? args.options.redirectTo : 'https://wrong.example.com')}` } } }; },
  updateUserById: async () => { directChanges++; return {}; },
 } },
 from: table => {
  const filters = {};
  let action = 'select'; let values;
  const q = { select: () => q, eq: (k,v) => { filters[k]=v; return q; },
   upsert: v => { action='upsert'; values=v; return q; }, update: v => { action='update'; values=v; return q; },
   single: async () => ({ data: table === 'company_settings' ? settings : filters.id === 'admin' ? actor : target }),
   then: (resolve,reject) => Promise.resolve().then(() => {
    if (action==='upsert') { Object.assign(tracked,values); updates.push(values); }
    if (action==='update' && updateFailure) return { error: { message: 'failed' } };
    if (action==='update') { Object.assign(tracked,values); updates.push(values); }
    return { data: tracked, error: null };
   }).then(resolve,reject),
  }; return q;
 },
});
async function load(path, substitutions = []) {
 let source = await readFile(path,'utf8');
 source = source.replace(/import \{ createClient \} from [^;]+;/, 'const createClient = globalThis.__createClient;');
 for (const [find,replace] of substitutions) source=source.replace(find,replace);
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
}
const {sendSystemEmail}=await load('supabase/functions/_shared/system-email.ts');
globalThis.__sendSystemEmail=sendSystemEmail;
const {renderAccountEmail}=await load('supabase/functions/_shared/account-email-template.ts');
globalThis.__renderAccountEmail=renderAccountEmail;
const {handleAccountEmail}=await load('supabase/functions/_shared/employee-account-email.ts', [[/import \{ sendSystemEmail \} from [^;]+;/,'const sendSystemEmail = globalThis.__sendSystemEmail;'],[/import \{ renderAccountEmail \} from [^;]+;/,'const renderAccountEmail = globalThis.__renderAccountEmail;']]);
const req = (body={email:target.email},token='valid') => new Request('https://edge.example.com',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
assert.equal((await handleAccountEmail(req({},'invalid'),'welcome')).status,401);
actor.role='tech'; assert.equal((await handleAccountEmail(req(),'welcome')).status,403); actor.role='admin';
actor.is_active=false; assert.equal((await handleAccountEmail(req(),'welcome')).status,403); actor.is_active=true;
assert.equal(sent.length,0);
delete env.RESEND_API_KEY;
assert.equal((await handleAccountEmail(req(),'welcome')).status,400);
assert.match(tracked.welcome_error,/RESEND_API_KEY/); assert.equal(generationCalls,0);
env.RESEND_API_KEY='test-key';
providerStatus=403; assert.equal((await handleAccountEmail(req(),'welcome')).status,400); assert.match(tracked.welcome_error,/Sender not verified/); assert.equal(tracked.welcome_sent_at,undefined);
providerStatus=200;
let response=await handleAccountEmail(req(),'welcome'); assert.equal(response.status,200); assert.equal((await response.json()).success,true);
assert.ok(tracked.welcome_sent_at); assert.equal(tracked.welcome_email_id,'email-123'); assert.equal(tracked.welcome_error,null);
assert.equal(sent.at(-1).payload.from,'Company <verified@example.com>'); assert.equal(sent.at(-1).payload.reply_to,'help@example.com');
assert.ok(sent.at(-1).payload.html.includes('Set Up My Account'));assert.ok(sent.at(-1).payload.html.includes('https://dealer.example.com/logo.png'));assert.ok(sent.at(-1).payload.html.includes('Powered by MyJobView'));assert.ok(sent.at(-1).payload.html.includes('mailto:help@example.com')); assert.ok(sent.at(-1).payload.html.includes('&lt;Employee&gt;'));
assert.ok(!sent.at(-1).payload.html.includes('<Employee>'));
response=await handleAccountEmail(req(),'reset'); assert.equal(response.status,200); assert.ok(sent.at(-1).payload.html.includes('Reset My Password'));
const count=sent.length; redirectAllowed=false; assert.equal((await handleAccountEmail(req(),'welcome')).status,400); assert.equal(sent.length,count); redirectAllowed=true;
await handleAccountEmail(req({email:target.email,password:'secure-password'}),'reset'); assert.equal(directChanges,1); assert.equal(sent.length,count);
updateFailure=true;response=await handleAccountEmail(req(),'welcome');const result=await response.json();assert.equal(result.success,true);assert.match(result.warning,/status could not be saved/);updateFailure=false;
// Central transport preserves recipient/content/idempotency while standardizing sender and credentials.
await sendSystemEmail({headers:{'Idempotency-Key':'claim-1',Authorization:'wrong-key'},body:JSON.stringify({from:'onboarding@resend.dev',to:['a@example.com'],cc:['b@example.com'],subject:'Example',attachments:[{filename:'x.txt',content:'eA=='}]})});
const last=sent.at(-1);assert.equal(last.payload.from,'Company <verified@example.com>');assert.equal(last.init.headers.get('Idempotency-Key'),'claim-1');assert.equal(last.init.headers.get('Authorization'),'Bearer test-key');assert.deepEqual(last.payload.cc,['b@example.com']);assert.equal(last.payload.attachments.length,1);
console.log('Account email authorization, configuration failures, provider rejection, setup/reset links, status tracking and central transport passed.');

// Auth-managed emails use the same transport; verify actual signatures and token mapping.
globalThis.__Webhook=Webhook;
const {handleAuthEmail}=await load('supabase/functions/send-auth-email/index.ts', [
 [/import 'jsr:[^;]+;/,''],
 [/import \{ Webhook \} from [^;]+;/,'const Webhook = globalThis.__Webhook;'],
 [/import \{ sendSystemEmail \} from [^;]+;/,'const sendSystemEmail = globalThis.__sendSystemEmail;'],
]);
const secret=Buffer.from('test-hook-secret-at-least-32-bytes').toString('base64');env.SEND_EMAIL_HOOK_SECRET='v1,whsec_'+secret;
function authReq(event, valid=true, date=new Date()) {
 const body=JSON.stringify(event);const id='hook-event-1';
 return new Request('https://edge.example.com',{method:'POST',body,headers:{'webhook-id':id,'webhook-timestamp':String(Math.floor(date.getTime()/1000)),'webhook-signature':valid?new Webhook(secret).sign(id,date,body):'v1,invalid'}});
}
const recovery={user:{email:'employee@example.com'},email_data:{email_action_type:'recovery',token_hash:'recovery-hash',redirect_to:'https://app.example.com',site_url:'https://app.example.com'}};
const before=sent.length;
assert.equal((await handleAuthEmail(authReq(recovery,false))).status,401);assert.equal(sent.length,before);
assert.equal((await handleAuthEmail(authReq(recovery,true,new Date(Date.now()-600000)))).status,401);assert.equal(sent.length,before);
assert.equal((await handleAuthEmail(authReq(recovery))).status,200);assert.ok(sent.at(-1).payload.text.includes('recovery-hash'));assert.equal(sent.at(-1).payload.from,'Company <verified@example.com>');
const change={user:{email:'old@example.com',new_email:'new@example.com'},email_data:{email_action_type:'email_change',token:'old-code',token_new:'new-code',token_hash:'hash-for-new',token_hash_new:'hash-for-old',redirect_to:'https://app.example.com'}};
assert.equal((await handleAuthEmail(authReq(change))).status,200);
assert.deepEqual(sent.at(-2).payload.to,['old@example.com']);assert.ok(sent.at(-2).payload.text.includes('hash-for-old'));
assert.deepEqual(sent.at(-1).payload.to,['new@example.com']);assert.ok(sent.at(-1).payload.text.includes('hash-for-new'));
providerStatus=403;assert.equal((await handleAuthEmail(authReq(recovery))).status,502);
console.log('Signed Auth hook recovery, replay-window rejection, provider failure and secure email-change token mapping passed.');

const fixture={kind:'welcome',companyName:'Other Dealer',companyLogoUrl:'https://other.example.com/logo.png',fullName:'Employee',email:'user@example.com',actionUrl:'https://app.example.com/setup',loginUrl:'https://app.example.com',supportEmail:'support@example.com'};
assert.ok(renderAccountEmail(fixture).html.includes('https://other.example.com/logo.png'));
const noLogo=renderAccountEmail({...fixture,companyLogoUrl:null}).html;assert.ok(noLogo.includes('Other Dealer'));assert.ok(!noLogo.includes('<img'));
assert.ok(!renderAccountEmail({...fixture,companyLogoUrl:'javascript:alert(1)'}).html.includes('<img'));
console.log('Dealer logo, company-name fallback, safe logo URLs and support footer passed.');
