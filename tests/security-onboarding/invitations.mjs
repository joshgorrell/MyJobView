import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
let authorized=true,providerFails=true,finishFails=false,reads=0,sends=0,finishes=0,message=null,sent=false;
const keys=[],payloads=[];
const attempt={id:'attempt-1',actor_id:'staff-1',organization_id:'org-1',token:'private-token',recipient:'override@example.com',expires_at:new Date(Date.now()+30*86400000).toISOString()};
const caller={auth:{getUser:async()=>({data:{user:{id:'staff-1'}}})},rpc:async()=>authorized?{data:{...attempt,sent_at:sent?'now':null,provider_id:sent?'provider-1':null}}:{error:{message:'Denied'}}};
const admin={from:table=>{
 const q={select:()=>q,eq:()=>q,neq:()=>q,single:async()=>read(),maybeSingle:async()=>read()};
 function read(){reads++;return {data:table==='security_contracts'?{organization_id:'org-1',contact_id:'contact-1'}:table==='contacts'?{full_name:'<img src=x onerror=alert(1)>',email:'original@example.com'}:table==='email_templates'?{subject:'Invitation {{customer_name}}',body:'<p>{{customer_name}}</p><a href="{{onboarding_url}}">Sign</a>'}:table==='company_settings'?{company_name:'Dealer',portal_url:'https://myjobview.com/portal',from_email:'dealer@example.com'}:table==='profiles'?{full_name:'Sales <Rep>',email:'rep@example.com'}:table==='organizations'?{}:null};}
 return q;
},rpc:async(name,args)=>{
 if(name==='security_invitation_message'){message ||= args.p_message;return {data:message};}
 if(name==='security_finish_invitation'){finishes++;if(finishFails)return {error:{message:'DB unavailable'}};sent=true;return {};}
 throw new Error('Unexpected RPC');
}};
globalThis.__invite={sendSystemEmail:init=>fetch('https://api.resend.com/emails',init),createClient:(_,key)=>key==='service'?admin:caller};
const source=(await readFile(new URL('../../supabase/functions/send-contract-invitation/index.ts',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
const compiled=ts.transpileModule(`const {sendSystemEmail,createClient}=globalThis.__invite;
const Deno={env:{get:key=>key==='SUPABASE_SERVICE_ROLE_KEY'?'service':key==='RESEND_API_KEY'?'fake-secret':'anon'},serve:h=>{globalThis.__inviteHandler=h}};
${source}`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const originalFetch=globalThis.fetch;
globalThis.fetch=async(_,opts)=>{
 sends++;keys.push(opts.headers['Idempotency-Key']);payloads.push(opts.body);
 if(providerFails)return new Response(JSON.stringify({message:'Provider unavailable'}),{status:503});
 return new Response(JSON.stringify({id:'provider-1'}),{status:200});
};
const call=async()=>{
 const result=await globalThis.__inviteHandler(new Request('https://test.example',{method:'POST',headers:{Authorization:'Bearer synthetic'},body:JSON.stringify({contractId:'contract-1',requestId:'request-1',appOrigin:'https://evil.example'})}));
 return {status:result.status,body:await result.json()};
};
try {
 authorized=false;await call();assert.equal(reads,0);assert.equal(sends,0,'Denied staff cannot send email');
 authorized=true;await call();assert.equal(finishes,0,'Provider failure never records an invitation');
 assert.deepEqual(message.to,['override@example.com']);assert.equal(message.reply_to,'rep@example.com');assert.ok(message.html.includes('Sales &lt;Rep&gt;'));assert.ok(message.html.includes('mailto:rep@example.com'));assert.ok(message.text.includes('rep@example.com'));assert.ok(message.html.includes('&lt;img'));assert.ok(!message.html.includes('https://evil.example'));
 providerFails=false;finishFails=true;let result=await call();assert.equal(result.body.success,false);assert.equal(sent,false);
 finishFails=false;result=await call();assert.equal(result.body.success,true);assert.equal(sent,true);
 assert.equal(new Set(keys).size,1);assert.equal(new Set(payloads).size,1,'Retries preserve the exact provider payload');
 const before=sends;assert.equal((await call()).body.success,true);assert.equal(sends,before,'Completed request does not send again');
} finally {globalThis.fetch=originalFetch;delete globalThis.__invite;delete globalThis.__inviteHandler;}
console.log('Invitation edge tests passed: effective recipient, permission denial, escaped content, origin validation, provider failure, recording failure, identical retry payload/key, and completed replay.');
