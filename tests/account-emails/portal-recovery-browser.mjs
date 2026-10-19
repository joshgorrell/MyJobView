import { build } from 'esbuild';
import { mkdtemp, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const dir = await mkdtemp(join(tmpdir(), 'mjv-portal-recovery-'));
const source = `import React from 'react';import {createRoot} from 'react-dom/client';import {PortalLogin} from './src/components/Portal/PortalLogin';createRoot(document.getElementById('root')).render(<PortalLogin/>);`;
const server = createServer(async (req,res) => {
 try {
  const file = req.url === '/app.js' ? 'app.js' : req.url === '/style.css' ? 'style.css' : 'index.html';
  res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
  res.end(await readFile(join(dir,file)));
 } catch { res.writeHead(404);res.end(); }
});
let browser;
try {
 await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'tsx'},bundle:true,format:'iife',jsx:'automatic',outfile:join(dir,'app.js'),define:{'import.meta.env.VITE_SUPABASE_URL':'"https://fixture.supabase.co"','import.meta.env.VITE_SUPABASE_ANON_KEY':'"fixture-key"'},plugins:[{name:'portal-fixtures',setup(b){
  b.onResolve({filter:/lib\/supabase$/},()=>({path:'supabase',namespace:'fixture'}));
  b.onResolve({filter:/contexts\/TenantContext$/},()=>({path:'tenant',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='tenant' ? `export function useTenant(){return {tenant:{organizationId:'elife-fixture',organizationName:'Electronic Life'},loading:false};}` : `export const supabase={auth:{getSession:async()=>({data:{session:null}})}};`}));
 }}]});
 const css = (await readdir('dist/assets')).find(x=>x.startsWith('index-')&&x.endsWith('.css'));
 await writeFile(join(dir,'style.css'),await readFile('dist/assets/'+css));
 await writeFile(join(dir,'index.html'),'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>');
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser = await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
 for (const width of [390,1280]) {
  const context = await browser.newContext({viewport:{width,height:900}});
  const page = await context.newPage();
  const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://fixture.supabase.co/functions/v1/send-portal-magic-link',async route=>{
   if (route.request().method()==='OPTIONS') { await route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'}});return; }
   const body=route.request().postDataJSON();requests.push(body);
   const denied=body.email==='unknown@example.com', failed=body.email==='failed@example.com';
   await route.fulfill({status:denied?403:failed?500:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(denied?{success:false,error:'We couldn’t find portal access for this email. Please contact us for assistance.'}:failed?{error:'Failed to send login email. Please try again.'}:{success:true})});
  });
  await page.goto('http://127.0.0.1:'+server.address().port+'/portal');
  await page.getByRole('heading',{name:'Get Your Magic Link'}).waitFor();
  assert.equal(await page.locator('input').count(),1);
  assert.equal(await page.getByText('Join VIP Program').count(),0);
  assert.equal(await page.getByText('Staff login',{exact:true}).count(),0);
  await page.getByLabel('Email Address').fill('unknown@example.com');
  await page.getByRole('button',{name:'Send My Link',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'couldn’t find portal access'}).waitFor();
  assert.equal(await page.getByRole('status').count(),0);
  assert.equal(await page.getByText('Sign Up Now',{exact:true}).count(),0);
  await page.getByLabel('Email Address').fill('failed@example.com');
  await page.getByRole('button',{name:'Send My Link',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Failed to send login email'}).waitFor();
  assert.equal(await page.getByRole('status').count(),0);
  await page.getByLabel('Email Address').fill('customer@example.com');
  await page.getByRole('button',{name:'Send My Link',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Your magic link has been sent to'}).waitFor();
  assert.deepEqual(requests.at(-1),{email:'customer@example.com',organizationId:'elife-fixture'});
  await page.getByRole('button',{name:'Use a different email address'}).click();
  assert.equal(await page.getByLabel('Email Address').inputValue(),'');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'No horizontal overflow');
  assert.deepEqual(errors,[]);
  await context.close();
 }
 console.log('Customer portal page passed on mobile and desktop: focused form, no-access, delivery failure, confirmed send, tenant identity and retry.');
} finally {await browser?.close();await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
