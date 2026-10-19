import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
const senderSource = await readFile('supabase/functions/send-portal-magic-link/index.ts','utf8');
const verifierSource = await readFile('supabase/functions/verify-portal-token/index.ts','utf8');
let contact, duplicate, recent, deliveryFails, lookupFails, calls, emails;
function reset() {
 contact = {id:'customer',email:'customer@example.com',organization_id:'dealer',portal_access_enabled:true};
 duplicate=false; recent=false; deliveryFails=false; lookupFails=false; calls=[]; emails=[];
}
function from(table) {
 const filters={}; let operation='select', values;
 const q = {
  select:()=>q, eq:(key,value)=>{filters[key]=value;return q;}, ilike:(key,value)=>{filters[key]=value;return q;},
  is:(key,value)=>{filters[key]=value;return q;}, gte:(key,value)=>{filters[key]=value;return q;}, limit:()=>q,
  insert:value=>{operation='insert';values=value;return q;},update:value=>{operation='update';values=value;return q;},
  maybeSingle:async()=>result(), then:(ok,fail)=>Promise.resolve(result()).then(ok,fail)
 };
 function result() {
  calls.push({table,operation,filters:{...filters},values});
  if(table==='contacts') return {data:duplicate?[contact,{...contact,id:'duplicate'}]:contact?[contact]:[],error:lookupFails?{message:'database unavailable'}:null};
  if(table==='portal_access_tokens') return operation==='select'?{data:recent?[{id:'recent'}]:[]}:{error:null};
  if(table==='company_settings') return {data:{company_name:'Dealer',from_email:'dealer@example.com',portal_url:'https://dealer.example/portal'}};
  if(table==='organizations') return {data:{subdomain:'dealer'}};
  throw Error('Unexpected query: '+table);
 }
 return q;
}
async function handler(source, client) {
 let serve;
 const js = ts.transpileModule(source.replace(/^import .*;\n/gm,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 vm.runInNewContext(js,{
  Deno:{env:{get:()=> 'configured'},serve:callback=>{serve=callback;}},
  createClient:()=>client,sendSystemEmail:async init=>{emails.push(JSON.parse(init.body));if(deliveryFails) return Response.json({error:'delivery failed'},{status:500});return Response.json({id:'sent'});},
  crypto:webcrypto,Request,Response,URL,console:{error:()=>{},log:()=>{}},Date,Uint8Array
 });
 return serve;
}
reset();
const send=await handler(senderSource,{from});
async function request(body) {const r=await send(new Request('https://edge.example',{method:'POST',body:JSON.stringify(body)}));return {status:r.status,body:await r.json()};}
let result=await request({email:'  CUSTOMER@EXAMPLE.COM  ',organizationId:'dealer'});
assert.equal(result.status,200);assert.equal(result.body.success,true);assert.equal(emails.length,1);
assert.deepEqual(emails[0].to,['customer@example.com']);
assert.ok(emails[0].html.includes('https://dealer.myjobview.com/portal?portal_token='));
assert.ok(calls.some(c=>c.table==='contacts'&&c.filters.email==='customer@example.com'&&c.filters.organization_id==='dealer'));
assert.ok(calls.some(c=>c.table==='company_settings'&&c.filters.organization_id==='dealer'));
assert.equal(calls.filter(c=>c.table==='portal_access_tokens'&&c.operation==='update').length,0,'Successful recovery preserves existing links');
reset();contact=null;result=await request({email:'unknown@example.com'});assert.equal(result.status,403);assert.equal(result.body.success,false);assert.equal(emails.length,0);
reset();contact.portal_access_enabled=false;assert.equal((await request({email:contact.email})).status,403);assert.equal(emails.length,0);
reset();recent=true;assert.equal((await request({email:contact.email})).status,429);assert.equal(emails.length,0);
reset();duplicate=true;assert.equal((await request({email:contact.email})).status,409);assert.equal(emails.length,0);
reset();lookupFails=true;assert.equal((await request({email:contact.email})).status,500);assert.equal(emails.length,0);
reset();assert.equal((await request({email:123})).status,400);assert.equal(calls.length,0);
reset();deliveryFails=true;assert.equal((await request({email:contact.email})).status,500);
const invalidated=calls.filter(c=>c.table==='portal_access_tokens'&&c.operation==='update');assert.equal(invalidated.length,1);assert.ok(invalidated[0].filters.token,'Failure invalidates only the unsent token');
reset();await request({email:contact.email,redirectTo:'https://evil.example'});assert.ok(!emails[0].html.includes('evil.example'));
reset();await request({email:contact.email,redirectTo:'/portal/invoices'});assert.ok(emails[0].html.includes('redirect=%2Fportal%2Finvoices'));
reset();
const verify=await handler(verifierSource,{from:table=>{
 const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:table==='portal_access_tokens'?{id:'token',contact_id:'customer',expires_at:'2099-01-01'}:{...contact,portal_access_enabled:false}})};return q;
},auth:{admin:{createUser:()=>assert.fail('Disabled access must never create an auth user')}}});
const denied=await verify(new Request('https://edge.example',{method:'POST',body:JSON.stringify({token:'existing-token'})}));assert.equal(denied.status,403);
console.log('Portal recovery: enabled non-VIP, unknown/disabled email, normalization, tenant scoping, duplicate matches, cooldown, delivery failure, safe redirects and revoked-link checks passed.');
