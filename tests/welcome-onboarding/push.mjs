import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const dir=await mkdtemp(tmpdir()+'/mjv-onboarding-push-');let prompts=0,registered=true,persistError=false,unsubscribed=0,existing=null;
const subscription={toJSON:()=>({endpoint:'fixture'}),endpoint:'fixture',unsubscribe:async()=>{unsubscribed++;return true;}};
globalThis.window={Notification:{},PushManager:{},atob:input=>Buffer.from(input,'base64').toString('binary')};globalThis.Notification={requestPermission:async()=>{prompts++;return 'granted';}};
Object.defineProperty(globalThis,'navigator',{value:{serviceWorker:{getRegistration:async()=>registered?{active:{},pushManager:{getSubscription:async()=>existing,subscribe:async()=>subscription}}:null}},configurable:true});
globalThis.__supabase={from:()=>({upsert:async()=>({error:persistError?{message:'Fixture write failure'}:null})})};
try {
 await build({entryPoints:['src/lib/pushNotifications.ts'],bundle:true,format:'esm',platform:'node',outfile:dir+'/push.mjs',define:{'import.meta.env.VITE_VAPID_PUBLIC_KEY':'"AQID"'},plugins:[{name:'supabase',setup(b){b.onResolve({filter:/supabase$/},()=>({path:'supabase',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const supabase=globalThis.__supabase;'}));}}]});
 const {subscribeToPushNotifications:subscribe,checkPushSubscription:check}=await import(pathToFileURL(dir+'/push.mjs'));
 assert.equal(await check(),false);assert.equal(prompts,0,'Reading onboarding does not request permission');
 registered=false;assert.equal(await check(),false);assert.equal(await subscribe('employee'),false);
 registered=true;persistError=true;assert.equal(await subscribe('employee'),false);assert.equal(unsubscribed,1,'New subscription rolled back when server save fails');
 existing=subscription;assert.equal(await subscribe('employee'),false);assert.equal(unsubscribed,1,'Previously enabled subscription is preserved');
 persistError=false;assert.equal(await subscribe('employee'),true);assert.equal(await check(),true);
 console.log('Opt-in push checks passed: no automatic permission prompt, no service-worker hang, verified persistence and failed-setup rollback.');
} finally {await rm(dir,{recursive:true,force:true});}
