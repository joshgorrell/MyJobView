import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
const dir=await mkdtemp(tmpdir()+'/mjv-recovery-');
let effects=[];let states=[];let authCallback;let subscriptions=0;
globalThis.__react={
 createContext:()=>({Provider:()=>null}),useContext:()=>null,
 useEffect:fn=>effects.push(fn),useState:initial=>{const i=states.length;states.push(initial);return [initial,value=>{states[i]=typeof value==='function'?value(states[i]):value;}];},
 createElement:()=>null,
};
globalThis.window={location:{hash:'#access_token=test&type=recovery',pathname:'/',search:'?account_setup=welcome'},history:{replaceState(){}}};
Object.defineProperty(globalThis,'navigator',{value:{userAgent:'test'},configurable:true});
globalThis.__supabase={auth:{getSession:async()=>({data:{session:{user:{id:'employee',user_metadata:{}}}}}),onAuthStateChange:fn=>{subscriptions++;authCallback=fn;return {data:{subscription:{unsubscribe(){}}}};}}};
try {
 await build({entryPoints:['src/contexts/AuthContext.tsx'],bundle:true,platform:'node',format:'cjs',jsx:'transform',outfile:dir+'/auth.cjs',plugins:[{name:'mocks',setup(b){
  b.onResolve({filter:/^react$/},()=>({path:'react',namespace:'mock'}));
  b.onResolve({filter:/lib\/supabase$/},()=>({path:'supabase',namespace:'mock'}));
  b.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:args.path==='react'?'export const {createContext,useContext,useEffect,useState}=globalThis.__react; export default globalThis.__react;':'export const supabase=globalThis.__supabase;'}));
 }}]});
 const {AuthProvider}=await import(pathToFileURL(dir+'/auth.cjs'));
 globalThis.React=globalThis.__react;
 AuthProvider({children:null});
 const cleanup=effects[0]();
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(subscriptions,1,'Recovery links must still install the auth listener');
 assert.equal(states[5],true,'Recovery mode survives initial session lookup');
 authCallback('INITIAL_SESSION',{user:{id:'employee',user_metadata:{}}});
 assert.equal(states[5],true,'Initial session must not replace password setup with dashboard');
 authCallback('PASSWORD_RECOVERY',{user:{id:'employee',user_metadata:{}}});
 assert.equal(states[0].id,'employee');assert.equal(states[3],false);
 cleanup();
 console.log('Recovery hash session initialization and auth events preserve the password setup screen.');
} finally {await rm(dir,{recursive:true,force:true});}
