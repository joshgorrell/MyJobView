import { build } from 'esbuild';
import { mkdtemp, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const dir=await mkdtemp(join(tmpdir(),'mjv-password-browser-'));
const source=`import React from 'react';import {createRoot} from 'react-dom/client';import {AuthProvider,useAuth} from './src/contexts/AuthContext';import {PasswordSetup} from './src/components/Auth/PasswordSetup';import {LoginForm} from './src/components/Auth/LoginForm';function Flow(){const {loading,user,profile,isPasswordRecovery}=useAuth();return loading?<p>Loading</p>:isPasswordRecovery?<PasswordSetup/>:user&&profile?<h1>Signed in as {profile.full_name}</h1>:<LoginForm/>;}createRoot(document.getElementById('root')).render(<AuthProvider><Flow/></AuthProvider>);`;
const server=createServer(async(req,res)=>{try{const filename=req.url.startsWith('/app.js')?'app.js':req.url.startsWith('/style.css')?'style.css':req.url.startsWith('/MJV_icon.PNG')?'MJV_icon.PNG':'index.html';res.setHeader('Content-Type',filename.endsWith('.js')?'text/javascript':filename.endsWith('.css')?'text/css':filename.endsWith('.PNG')?'image/png':'text/html');res.end(await readFile(join(dir,filename)));}catch{res.writeHead(404);res.end();}});
let browser;
const user={id:'00000000-0000-0000-0000-000000000001',email:'employee@example.com',aud:'authenticated',role:'authenticated',user_metadata:{},app_metadata:{},created_at:'2026-01-01T00:00:00Z'};
const jwt=[{alg:'HS256',typ:'JWT'},{sub:user.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated',aud:'authenticated'},Buffer.alloc(32,1).toString('base64url')].map((x,i)=>i<2?Buffer.from(JSON.stringify(x)).toString('base64url'):x).join('.');
const session={access_token:jwt,refresh_token:'fixture-refresh',token_type:'bearer',expires_in:3600,user};
let password='initial-password',rejectPassword=false,expired=false;
const calls=[];
try {
 await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'tsx'},bundle:true,format:'iife',jsx:'automatic',outfile:join(dir,'app.js'),define:{'import.meta.env.VITE_SUPABASE_URL':'"https://fixture.supabase.co"','import.meta.env.VITE_SUPABASE_ANON_KEY':'"fixture-key"'},plugins:[{name:'diagnostics',setup(b){b.onResolve({filter:/Shared\/BrowserDiagnostics$/},()=>({path:'diagnostics',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export function BrowserDiagnostics(){return null}'}));}}]});
 const css=(await readdir('dist/assets')).find(x=>x.startsWith('index-')&&x.endsWith('.css'));
 await writeFile(join(dir,'style.css'),await readFile('dist/assets/'+css));await writeFile(join(dir,'MJV_icon.PNG'),await readFile('public/MJV_icon.PNG'));
 await writeFile(join(dir,'index.html'),'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>');
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
 async function pageFor(path, width=390, storage={}) {
  const context=await browser.newContext({viewport:{width,height:844}});await context.addInitScript(values=>{for(const [k,v] of Object.entries(values))localStorage.setItem(k,v);},storage);
  await context.route('https://fixture.supabase.co/**',async route=>{
   const req=route.request(),u=new URL(req.url()),body=req.postDataJSON();calls.push({path:u.pathname,method:req.method(),body});let result={},status=200;
   if(u.pathname==='/auth/v1/verify') {if(expired){result={code:'otp_expired',msg:'Token has expired'};status=403;}else result=session;}
   else if(u.pathname==='/auth/v1/user'&&req.method()==='PUT'){if(rejectPassword){result={code:'weak_password',msg:'Please choose a stronger password'};status=422;}else{password=body.password;result=user;}}
   else if(u.pathname==='/auth/v1/user')result=user;
   else if(u.pathname==='/auth/v1/token'){if(u.searchParams.get('grant_type')==='password'&&body.password!==password){result={code:'invalid_credentials',msg:'Invalid login credentials'};status=400;}else result=session;}
   else if(u.pathname==='/rest/v1/profiles')result={...user,full_name:'Test Employee',is_active:true,organization_id:'org'};
   else if(u.pathname==='/rest/v1/company_settings')result={company_name:'Fixture'};
   else if(u.pathname.startsWith('/rest/v1/rpc/'))result=null;
   await route.fulfill({status,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,PUT,OPTIONS'},body:JSON.stringify(result)});
  });const page=await context.newPage();page.setDefaultTimeout(15000);console.log('Checking',path.includes('account_token_hash')?path.split('#')[0]:path.split('#')[0]||'/');const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url+path,{waitUntil:'domcontentloaded'});return {page,context,errors};
 }
 const count=path=>calls.filter(c=>c.path===path).length;
 async function fill(page,value='chosen-password'){await page.getByLabel('New password',{exact:true}).fill(value);await page.getByLabel('Confirm password',{exact:true}).fill(value);}
 // A fresh browser (no verifier), actual SDK, actual provider and actual UI.
 let {page,context,errors}=await pageFor('/?account_setup=welcome#account_token_hash=welcome-test');
 await page.getByRole('heading',{name:'Welcome to MyJobView'}).waitFor();if(process.env.ACCOUNT_PASSWORD_SCREENSHOT)await page.screenshot({path:process.env.ACCOUNT_PASSWORD_SCREENSHOT,fullPage:true});assert.equal(count('/auth/v1/verify'),0,'Opening the email must not consume the token');
 await fill(page);await page.getByLabel('Confirm password',{exact:true}).fill('different-password');await page.getByRole('button',{name:'Set My Password'}).click();await page.getByRole('alert').filter({hasText:'do not match'}).waitFor();assert.equal(count('/auth/v1/verify'),0);
 await fill(page);rejectPassword=true;await page.getByRole('button',{name:'Set My Password'}).click();await page.getByRole('alert').filter({hasText:'stronger password'}).waitFor();assert.equal(count('/auth/v1/verify'),1);
 rejectPassword=false;await page.getByRole('button',{name:'Set My Password'}).click();await page.getByRole('heading',{name:'Your password is ready'}).waitFor();assert.equal(count('/auth/v1/verify'),1,'Retry after a password policy failure reuses the verified session');assert.equal(new URL(page.url()).hash,'');
 await page.getByRole('button',{name:'Go to Sign In'}).click();await page.getByRole('button',{name:'Sign In',exact:true}).waitFor();assert.ok(count('/auth/v1/logout')>0);
 await page.locator('input[type=email]').fill(' employee@example.com ');await page.locator('input[type=password]').fill('initial-password');await page.getByRole('button',{name:'Sign In',exact:true}).click();await page.getByText('The email or password is incorrect. Use Forgot password to choose a new password.').waitFor();await page.locator('input[type=password]').fill(password);await page.getByRole('button',{name:'Sign In',exact:true}).click();await page.getByRole('heading',{name:'Signed in as Test Employee'}).waitFor();assert.deepEqual(errors,[]);await context.close();
 // Regular reset + browser refresh preserve the password form without auto-verification.
 ({page,context,errors}=await pageFor('/?account_setup=reset#account_token_hash=reset-test',1280));let before=count('/auth/v1/verify');await page.getByRole('heading',{name:'Choose a new password'}).waitFor();await page.reload();await page.getByRole('heading',{name:'Choose a new password'}).waitFor();assert.equal(count('/auth/v1/verify'),before);await fill(page);await page.getByRole('button',{name:'Save New Password'}).click();await page.getByRole('heading',{name:'Your password is ready'}).waitFor();assert.equal(count('/auth/v1/verify'),before+1);assert.deepEqual(errors,[]);await context.close();
 // Recovery stays on the password form even when the browser already has a session.
 ({page,context,errors}=await pageFor('/?account_setup=reset#account_token_hash=existing-session-test',390,{'sb-fixture-auth-token':JSON.stringify({...session,expires_at:Math.floor(Date.now()/1000)+3600})}));before=count('/auth/v1/verify');await page.getByRole('heading',{name:'Choose a new password'}).waitFor();assert.equal(count('/auth/v1/verify'),before);await fill(page);await page.getByRole('button',{name:'Save New Password'}).click();await page.getByRole('heading',{name:'Your password is ready'}).waitFor();assert.equal(count('/auth/v1/verify'),before+1);assert.deepEqual(errors,[]);await context.close();
 // Invalid token displays recovery and lets the person request a replacement.
 expired=true;({page,context,errors}=await pageFor('/?account_setup=welcome#account_token_hash=expired-test'));await fill(page);await page.getByRole('button',{name:'Set My Password'}).click();await page.getByRole('heading',{name:'Let’s get you a fresh link'}).waitFor();await page.getByLabel('Account email').fill('employee@example.com');await page.getByRole('button',{name:'Send New Link'}).click();await page.getByRole('status').waitFor();assert.ok(calls.some(c=>c.path==='/auth/v1/recover'&&c.body.email==='employee@example.com'));assert.deepEqual(errors,[]);await context.close();expired=false;
 ({page,context}=await pageFor('/#error=access_denied&error_code=otp_expired&error_description=Expired'));await page.getByRole('heading',{name:'Let’s get you a fresh link'}).waitFor();await context.close();
 // Previously sent implicit and PKCE links remain usable with a PKCE client.
 ({page,context,errors}=await pageFor('/?account_setup=welcome#type=recovery&access_token='+jwt+'&refresh_token=fixture-refresh'));await fill(page);await page.getByRole('button',{name:'Set My Password'}).click();await page.getByRole('heading',{name:'Your password is ready'}).waitFor();assert.deepEqual(errors,[]);await context.close();
 ({page,context,errors}=await pageFor('/?code=old-reset-code',390,{'sb-fixture-auth-token-code-verifier':JSON.stringify('old-verifier/PASSWORD_RECOVERY')}));await page.getByRole('heading',{name:'Choose a new password'}).waitFor();assert.equal(calls.filter(c=>c.path==='/auth/v1/token'&&c.body.auth_code==='old-reset-code').length,0);await fill(page);await page.getByRole('button',{name:'Save New Password'}).click();await page.getByRole('heading',{name:'Your password is ready'}).waitFor();assert.ok(calls.some(c=>c.body?.auth_code==='old-reset-code'&&c.body.code_verifier==='old-verifier'));assert.deepEqual(errors,[]);await context.close();
 console.log('Actual SDK browser flows passed: fresh-browser welcome, regular reset, refresh, password mismatch/policy retry, expired links, replacement requests, legacy implicit/PKCE, sign-out and new-password login.');
} finally {await browser?.close();await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
