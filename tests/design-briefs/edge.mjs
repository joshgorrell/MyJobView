import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const transpile=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const validation={exports:{}};vm.runInNewContext(transpile(readFileSync('supabase/functions/process-design-brief/validation.ts','utf8')),{module:validation,exports:validation.exports});
let handler,invalid=false,changed=false,denied=false,aiCalls=0,submitCalls=0,saved=[];
const brief={id:'brief',organization_id:'org',contact_id:'contact',raw_notes:'Saved original notes',status:'draft',updated_at:'version-1',linked_proposal_id:null};
function client(){return{auth:{getUser:async()=>({data:{user:{id:'rep'}},error:null})},rpc:async(name)=>{assert.equal(name,'design_brief_submit');submitCalls++;return{data:'brief',error:null};},from(table){let update,filters=[];const q={select(){return q;},update(value){update=value;return q;},eq(k,v){filters.push([k,v]);return q;},is(){return q;},neq(){return q;},order(){return q;},limit(){return q;},maybeSingle(){return q;},single(){return q;},then(resolve){let data=table==='design_briefs'?brief:table==='company_settings'?{openai_api_key:'private-key'}:[];let error=null;if(denied&&table==='design_briefs')data=null;if(update){assert.equal(table,'design_briefs');assert.deepEqual(Object.keys(update),['ai_summary']);assert.ok(filters.some(([k,v])=>k==='updated_at'&&v==='version-1'));if(changed){data=null;error={message:'zero rows'};}else{saved.push(update);data={id:'brief'};}}return Promise.resolve({data,error}).then(resolve);}};return q;}};}
const source=readFileSync('supabase/functions/process-design-brief/index.ts','utf8').replace(/^import .*;\n/gm,'');
vm.runInNewContext(transpile(source),{Deno:{env:{get:()=>''},serve:fn=>handler=fn},createClient:client,validatePrefill:validation.exports.validatePrefill,Response,console,fetch:async()=>{aiCalls++;return{ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify(invalid?{}:{rooms:[{name:'Kitchen',lineItems:[{description:'Speaker',quantity:2,unit:'EA',itemType:'material'}]}]})}}]})};}});
const request=body=>({method:'POST',headers:new Headers({Authorization:'Bearer test'}),json:async()=>body});
let response=await handler(request({briefId:'brief'}));assert.equal(response.status,200);assert.equal(saved.length,1);assert.equal(submitCalls,0);assert.equal((await response.json()).proposalId,null);
response=await handler(request({briefId:'brief',action:'submit'}));assert.equal(response.status,200);assert.equal(submitCalls,1);assert.equal(aiCalls,1,'Submission must not call AI');
invalid=true;response=await handler(request({briefId:'brief'}));assert.equal(response.status,500);assert.equal(saved.length,1,'Malformed AI output must not be saved');
invalid=false;changed=true;response=await handler(request({briefId:'brief'}));assert.equal(response.status,500);assert.match((await response.json()).error,/Brief changed/);
denied=true;response=await handler(request({briefId:'brief'}));assert.equal(response.status,403);
console.log('PASS: actual edge handler preview/submission separation, malformed AI rejection, concurrent-edit conflict and denied-access handling');
