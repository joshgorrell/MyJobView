import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const read=path=>readFile(new URL('../../'+path,import.meta.url),'utf8');
async function load(path){const source=await read(path);const result=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022},reportDiagnostics:true});assert.equal(result.diagnostics?.length??0,0,path);return import('data:text/javascript;base64,'+Buffer.from(result.outputText).toString('base64'));}
const chat=await load('supabase/functions/_shared/website-chat-session.ts');
const token=chat.newVisitorToken();
assert.match(token,/^[0-9a-f]{64}$/);
assert.notEqual(token,chat.newVisitorToken());
assert.equal(await chat.hashVisitorToken(token),await chat.hashVisitorToken(token));
assert.notEqual(await chat.hashVisitorToken(token),token);
await assert.rejects(async()=>chat.hashVisitorToken('bad'));
assert.equal(chat.validateChatOrigin('https://example.com'),'https://example.com');
for(const origin of ['null','http://example.com','https://example.com/path'])assert.throws(()=>chat.validateChatOrigin(origin));
const requestId=crypto.randomUUID();
assert.equal(chat.validateChatMessage({requestId,body:' hello '}).body,'hello');
for(const body of ['', ' ', 'a'.repeat(4001)])assert.throws(()=>chat.validateChatMessage({requestId,body}));
for(const endpoint of ['website-widget-config','submit-website-lead','submit-website-service','submit-website-feedback','website-chat','website-analytics']){
 const source=await read('supabase/functions/'+endpoint+'/index.ts');
 let handler;
 const js=ts.transpileModule(source.replace(/^import .*;\s*$/gm,''),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 const Deno={env:{get:()=>undefined},serve:fn=>{handler=fn}};
 new Function('Deno',js)(Deno);
 assert.equal(typeof handler,'function');
 for(const method of ['GET','POST','OPTIONS'])assert.equal((await handler(new Request('https://api.example.com',{method}))).status,404,endpoint);
}
console.log('Functional session and disabled endpoint tests passed');
