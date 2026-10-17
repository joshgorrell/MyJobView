import assert from 'node:assert/strict';
import { build } from 'esbuild';
import ts from 'typescript';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { chromium } from 'playwright';

// Guard against restoring browser popups, including inside inline handlers.
async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) { await scan(path); continue; }
    if (!/\.tsx?$/.test(path)) continue;
    const source = ts.createSourceFile(path, await readFile(path, 'utf8'), ts.ScriptTarget.Latest, true);
    function visit(node) {
      if (ts.isCallExpression(node)) {
        const expression = node.expression;
        const native = ts.isIdentifier(expression) && ['alert', 'confirm', 'prompt'].includes(expression.text)
          || ts.isPropertyAccessExpression(expression) && expression.expression.getText(source) === 'window' && ['alert', 'confirm', 'prompt'].includes(expression.name.text);
        assert.ok(!native, `Native popup in ${path}: ${node.getText(source)}`);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
}
await scan('src');
const directory = await mkdtemp(join(tmpdir(), 'mjv-feedback-'));
const source = `import React,{useState} from 'react';import{createRoot}from'react-dom/client';
import{FeedbackHost}from'./src/components/Shared/FeedbackHost';
import{QuickActionModal}from'./src/components/Shared/QuickActionModal';
import{CompletionDialog}from'./src/components/Shared/CompletionDialog';
import{useCompletion}from'./src/hooks/useCompletion';
import{FlowCreateModal}from'./src/components/Flow/FlowCreateModal';
import{notify,requestConfirmation,requestText}from'./src/lib/feedback';
function Harness(){const[modal,setModal]=useState(false);const[message,setMessage]=useState(false);const[result,setResult]=useState('waiting');const done=useCompletion(()=>{window.finishes=(window.finishes||0)+1;setResult('finished')},1000);
return <><button id="delete" onClick={async()=>{if(await requestConfirmation('Delete this proposal?',{theme:'violet'})){window.deletes=(window.deletes||0)+1;setResult('deleted')}}}>Delete proposal</button>
<button id="prompt" onClick={async()=>{const value=await requestText('Add rejection reason','',{theme:'emerald'});window.response=value;setResult(value===null?'cancelled':'response: '+value)}}>Enter reason</button>
<button id="queue" onClick={async()=>{const a=requestConfirmation('First decision',{theme:'blue'});const b=requestText('Second decision','',{theme:'cyan'});window.queue=[await a,await b]}}>Queue decisions</button>
<button id="notice" onClick={()=>notify('Appointment scheduled!',{theme:'cyan',tone:'success'})}>Show notice</button>
<button id="error" onClick={()=>notify('Could not save. Your draft is preserved.',{theme:'emerald',tone:'error'})}>Show error</button>
<button id="modal" onClick={()=>setModal(true)}>Open modal</button>
<button id="message" onClick={()=>setMessage(true)}>Open Message</button><button id="complete" onClick={done.complete}>Complete payment</button><output>{result}</output>
{modal&&<QuickActionModal title="Teal workflow" icon={<span/>} accentColor="from-teal-600 to-cyan-700" showSuccess={location.search.includes('success')} onClose={()=>setModal(false)}><input aria-label="Underlying form"/><button onClick={()=>notify('Teal saved',{theme:'violet',tone:'success'})}>Save</button></QuickActionModal>}
{done.completed&&result!=='finished'&&<CompletionDialog title="Payment recorded!" theme="emerald" kind="payment" onContinue={done.finish}/>}
<FeedbackHost/>{message&&<FlowCreateModal scope={{}} initial="chat" canInteract onClose={()=>setMessage(false)} onSaved={()=>{window.messages=(window.messages||0)+1;setMessage(false)}}/>}</>};createRoot(document.getElementById('root')).render(<Harness/>);`;
const server = createServer(async (req, res) => {
  const name = req.url.startsWith('/app.js') ? 'app.js' : req.url.startsWith('/app.css') ? 'app.css' : req.url.startsWith('/style.css') ? 'style.css' : 'index.html';
  res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html');
  res.end(await readFile(join(directory, name)));
});
let browser;
try {
  await build({ stdin: { contents: source, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, format: 'iife', jsx: 'automatic', outfile: join(directory, 'app.js'), plugins: [{name:'flow-fixtures',setup(b){
    b.onResolve({filter:/Feed\/DiscussionPostForm$|\.\/PostFlowUpdate$|\.\/FlowInteractionForm$/},()=>({path:'forms',namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:"import React from 'react';export function DiscussionPostForm({onSuccess}){return <button onClick={onSuccess}>Send fixture</button>}export function PostFlowUpdate({onPosted}){return <button onClick={onPosted}>Post fixture</button>}export function FlowInteractionForm({onSaved}){return <button onClick={onSaved}>Save fixture</button>}",loader:'jsx',resolveDir:process.cwd()}));
  }}] });
  const css = (await readdir('dist/assets')).find(name => name.startsWith('index-') && name.endsWith('.css'));
  await writeFile(join(directory, 'style.css'), await readFile('dist/assets/' + css));
  await writeFile(join(directory, 'index.html'), '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="style.css"><link rel="stylesheet" href="app.css"></head><body><div id="root"></div><script src="app.js"></script></body></html>');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined, args: ['--no-sandbox'] });
  const page = await browser.newPage(); const errors = []; const native = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => { native.push(dialog.type()); void dialog.dismiss(); });
  const url = 'http://127.0.0.1:' + server.address().port;
  for (const theme of ['dark', 'light']) for (const viewport of [{width:320,height:568},{width:375,height:667},{width:390,height:420},{width:667,height:375},{width:1280,height:900}]) {
    await page.setViewportSize(viewport); await page.goto(url); await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
    await page.locator('#delete').click();
    const dialog = page.getByRole('dialog'); await dialog.waitFor();
    assert.equal(await page.evaluate(() => window.deletes || 0), 0, 'no action before confirming');
    assert.equal(await page.locator('#root').evaluate(node => node.inert), true);
    assert.equal(await dialog.evaluate(node => getComputedStyle(node).backgroundColor === 'rgba(0, 0, 0, 0)'), false);
    const bounds = await dialog.boundingBox(); assert.ok(bounds.x>=0 && bounds.y>=0 && bounds.x+bounds.width<=viewport.width+1 && bounds.y+bounds.height<=viewport.height+1);
    if (theme === 'dark' && viewport.width === 375) { await page.waitForTimeout(250); await page.screenshot({path: '/tmp/mjv-feedback-mobile.png'}); }
    await page.keyboard.press('Tab'); assert.ok(await dialog.evaluate(node => node.contains(document.activeElement)));
    await page.keyboard.press('Escape'); await dialog.waitFor({state:'detached'});
    assert.equal(await page.evaluate(() => window.deletes || 0), 0);
    assert.equal(await page.locator('#delete').evaluate(node => node === document.activeElement), true, 'restore focus');
    await page.locator('#delete').click(); await page.getByRole('button',{name:'Confirm action',exact:true}).click();
    await page.waitForFunction(() => window.deletes === 1);
    await page.locator('#prompt').click(); await page.getByLabel('Your response').fill('Customer requested a revision');
    await page.getByRole('button',{name:'Continue',exact:true}).click(); await page.waitForFunction(() => window.response === 'Customer requested a revision');
    await page.locator('#prompt').click(); await page.keyboard.press('Escape'); await page.waitForFunction(() => window.response === null);
    await page.locator('#queue').click(); await page.getByRole('button',{name:'Continue',exact:true}).click();
    await page.getByLabel('Your response').fill('Second answer'); await page.getByRole('button',{name:'Continue',exact:true}).click();
    await page.waitForFunction(() => window.queue?.[1] === 'Second answer'); assert.equal(await page.evaluate(() => window.queue[0]), true);
    await page.locator('#notice').click(); await page.getByRole('status').filter({hasText:'Appointment scheduled!'}).waitFor();
    assert.equal(await page.locator('.feedback-notice').evaluate(node=>getComputedStyle(node).getPropertyValue('--feedback-accent').trim()), '#06b6d4');
    await page.getByRole('button',{name:'Dismiss notification'}).click(); await page.locator('.feedback-notice').waitFor({state:'detached'});
    await page.locator('#modal').click(); await page.getByRole('dialog',{name:'Teal workflow'}).waitFor(); await page.getByRole('button',{name:'Save',exact:true}).click(); await page.getByRole('status').filter({hasText:'Teal saved'}).waitFor(); assert.equal(await page.locator('.feedback-notice').evaluate(node=>getComputedStyle(node).getPropertyValue('--feedback-accent').trim()), 'rgb(13, 148, 136)'); await page.getByRole('button',{name:'Dismiss notification'}).click(); await page.locator('.feedback-notice').waitFor({state:'detached'}); await page.keyboard.press('Escape');
    await page.locator('#complete').click(); await page.getByRole('status').filter({hasText:'Payment recorded!'}).waitFor();
    await page.waitForFunction(()=>window.finishes===1); await page.waitForTimeout(150); assert.equal(await page.evaluate(()=>window.finishes),1);
    console.log(theme, viewport, 'confirmation, cancel, prompt, queue, focus, theme and completion passed');
  }
  await page.goto(url+'?success'); await page.emulateMedia({reducedMotion:'reduce'}); await page.locator('#modal').click();
  assert.equal(await page.locator('.qam-success').evaluate(node=>getComputedStyle(node).color), 'rgb(45, 212, 191)');
  assert.equal(await page.locator('.qam-body').evaluate(node=>node.inert), true);
  assert.equal(await page.locator('.qam-success').evaluate(node=>[node,...node.querySelectorAll('*')].every(el=>getComputedStyle(el).animationName==='none')), true);
  await page.keyboard.press('Escape'); await page.locator('#error').click(); await page.getByRole('alert').waitFor();
  await page.getByRole('button',{name:'Dismiss notification'}).click();
  await page.locator('.feedback-notice').waitFor({state:'detached'});
  await page.locator('#message').click(); await page.getByRole('dialog',{name:'Message',exact:true}).waitFor();
  await page.getByRole('button',{name:'Send fixture'}).click();
  await page.getByRole('status').filter({hasText:'Message sent!'}).waitFor();
  assert.equal(await page.evaluate(()=>window.messages||0),0,'completion remains visible before handoff');
  await page.keyboard.press('Escape'); await page.waitForFunction(()=>window.messages===1);
  await page.waitForTimeout(1200); assert.equal(await page.evaluate(()=>window.messages),1,'no duplicate completion after early close');
  assert.deepEqual(native, []); assert.deepEqual(errors, []);
} finally { await browser?.close(); server.close(); await rm(directory,{recursive:true,force:true}); }
