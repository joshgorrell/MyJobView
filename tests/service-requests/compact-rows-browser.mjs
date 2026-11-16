import { build } from 'esbuild';
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
const dir = await mkdtemp(join(tmpdir(),'request-rows-'));
let browser;
const server=createServer(async(req,res)=>{const name=req.url==='/app.js'?'app.js':req.url==='/style.css'?'style.css':'index.html';res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(await readFile(join(dir,name)));});
try {
  await writeFile(join(dir,'input.css'),'@tailwind base; @tailwind components; @tailwind utilities;');
  execFileSync(process.execPath,['node_modules/tailwindcss/lib/cli.js','-i',join(dir,'input.css'),'-o',join(dir,'style.css'),'--content','src/components/Shared/CompactRequestRow.tsx']);
  await build({stdin:{contents:`import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{CompactRequestRow}from'./src/components/Shared/CompactRequestRow';function App(){const[open,setOpen]=useState(-1);return <main>{Array.from({length:12},(_,i)=><section key={i} style={{borderBottom:'1px solid #444'}}><CompactRequestRow customer={'Radiant Dance Studio — A very long customer name '+i} description={'Customer needs the scheduler to arrange a return visit and check several rooms'} status={i%2?'Ready to Schedule':'Pending – Waiting on Customer'} creator="Aaron Koker" createdAt="2026-11-16" expanded={open===i} onToggle={()=>setOpen(open===i?-1:i)}/>{open===i&&<p>Full contact history and actions</p>}</section>)}</main>}createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,jsx:'automatic',outfile:join(dir,'app.js')});
  await writeFile(join(dir,'index.html'),'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>');
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--single-process','--no-zygote']});
  const page=await browser.newPage();
  for(const width of [320,375,390,430]){
    await page.setViewportSize({width,height:844});await page.goto('http://127.0.0.1:'+server.address().port);
    const rows=page.getByRole('button');await rows.first().waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'No horizontal overflow');
    const box=await rows.first().boundingBox();assert.ok(box.height>=44&&box.height<=90,'Dense rows keep accessible touch targets');
    const visible=await rows.evaluateAll(nodes=>nodes.filter(n=>n.getBoundingClientRect().bottom<=innerHeight).length);
    assert.ok(visible>=8,'At least eight complete request rows fit in 844px list viewport');
    await rows.first().click();assert.equal(await rows.first().getAttribute('aria-expanded'),'true');await page.getByText('Full contact history and actions').waitFor();
    await rows.first().click();assert.equal(await rows.first().getAttribute('aria-expanded'),'false');
    console.log(`${width}px: ${box.height}px rows, ${visible} visible, long text contained, expand/collapse passed`);
  }
} finally {await browser?.close();server.close();await rm(dir,{recursive:true,force:true});}
