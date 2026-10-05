import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
let saveFails=false, existing=true, payments=true, writes=[], consumed=0;
const db={from(table){const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:table==='qbo_oauth_sessions'?{organization_id:'org',app_url:'https://dealer.example',expires_at:new Date(Date.now()+60000).toISOString(),payments_requested:payments}:existing?{id:'settings'}:null}),update:value=>{writes.push({table,value});if(table==='qbo_oauth_sessions')consumed++;return q},insert:value=>{writes.push({table,value});return q},then:done=>Promise.resolve({error:table==='quickbooks_settings'&&saveFails?{message:'DB failure'}:null}).then(done)};return q;}};
globalThis.__oauth={corsHeaders:{},getTokenUrl:()=> 'https://provider.example/token',getSupabaseAdmin:()=>db,getBaseUrl:()=> 'https://provider.example'};
const source=(await readFile(new URL('../../supabase/functions/quickbooks-oauth-callback/index.ts',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
const compiled=ts.transpileModule(`const {corsHeaders,getTokenUrl,getSupabaseAdmin,getBaseUrl}=globalThis.__oauth;const Deno={env:{get:k=>k==='QUICKBOOKS_ENVIRONMENT'?'sandbox':'fixture'},serve:h=>globalThis.__oauthHandler=h};${source}`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const fetchBefore=globalThis.fetch;
globalThis.fetch=async url=>new Response(JSON.stringify(url.endsWith('/token')?{access_token:'synthetic',refresh_token:'synthetic',expires_in:3600}:{CompanyInfo:{CompanyName:'Test Company'}}));
const call=()=>globalThis.__oauthHandler(new Request('https://callback.example?code=synthetic&realmId=test&state=synthetic'));
try{
 for(existing of [true,false]){
  saveFails=false;writes=[];consumed=0;
  let response=await call();let url=new URL(response.headers.get('Location'));
  assert.equal(url.origin,'https://dealer.example');assert.equal(url.pathname,'/');
  assert.deepEqual(Object.fromEntries(url.searchParams),{tab:'settings',settingsTab:'integrations',integration:'quickbooks',qbo:'success'});
  assert.equal(writes.find(w=>w.table==='quickbooks_settings').value.payments_enabled,true);assert.equal(consumed,1);
  saveFails=true;consumed=0;response=await call();url=new URL(response.headers.get('Location'));
  assert.equal(url.searchParams.get('qbo'),'error');assert.equal(url.searchParams.get('integration'),'quickbooks');assert.equal(consumed,0,'Never confirm a connection that failed to save');
 }
 saveFails=false;payments=false;writes=[];await call();assert.equal(writes.find(w=>w.table==='quickbooks_settings').value.payments_enabled,false,'Accounting alone never enables Payments');
}finally{globalThis.fetch=fetchBefore;delete globalThis.__oauth;delete globalThis.__oauthHandler;}
console.log('OAuth tests passed: sandbox authorization, direct settings return, Payments scope and failed-save confirmation guards.');
